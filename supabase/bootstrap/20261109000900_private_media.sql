-- This registry belongs to the trusted media broker. No app client may pass
-- an actor ID to a SECURITY DEFINER function or access object keys directly.
create table public.media_objects (
  bucket text not null check (bucket in ('album-media', 'memory-photos', 'message-media', 'avatars')),
  path text not null check (char_length(path) between 1 and 220),
  -- Retain tombstones after the space and uploader are removed. R2 cleanup
  -- needs the object key even after the SQL data is gone.
  couple_id uuid not null,
  owner_id uuid not null,
  object_key text not null unique,
  byte_size bigint not null check (byte_size between 1 and 1073741824),
  content_type text not null,
  status text not null default 'pending' check (status in ('pending', 'ready', 'deleted')),
  upload_until timestamptz not null,
  purged_at timestamptz,
  primary key (bucket, path)
);

create index media_objects_couple_idx on public.media_objects (couple_id) where status <> 'deleted';
create index media_objects_cleanup_idx on public.media_objects (upload_until)
  where status in ('pending', 'deleted') and purged_at is null;

alter table public.media_objects enable row level security;
revoke all on public.media_objects from public, anon, authenticated, service_role;

create function app_private.media_broker_result(asset public.media_objects)
returns jsonb
language sql immutable set search_path = ''
as $$
  select jsonb_build_object(
    'object_key', asset.object_key, 'status', asset.status,
    'byte_size', asset.byte_size, 'content_type', asset.content_type,
    'upload_until', asset.upload_until, 'bucket', asset.bucket, 'path', asset.path
  );
$$;
revoke all on function app_private.media_broker_result(public.media_objects) from public, anon, authenticated, service_role;

create function public.media_broker(
  p_action text,
  p_actor uuid default null,
  p_bucket text default null,
  p_path text default null,
  p_size bigint default null,
  p_content_type text default null
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  asset public.media_objects;
  target_couple_id uuid;
  uid_pattern constant text := '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
  couple_prefix text;
  normalized_type text := lower(btrim(split_part(p_content_type, ';', 1)));
  path_extension text := substring(p_path from '\.([a-z0-9]+)$');
  is_raster boolean;
  sweep_result jsonb;
begin
  if p_action in ('sweep', 'purged') then
    if p_actor is not null then raise exception 'Media operation denied' using errcode = '42501'; end if;
    if p_action = 'sweep' then
      -- A PUT that began before its signature expired may still be in
      -- flight. Keep the tombstone and allow an hour of transfer grace.
      with candidates as (
        select bucket, path from public.media_objects
        where status in ('pending', 'deleted') and purged_at is null
          and upload_until < statement_timestamp() - interval '1 hour'
        order by upload_until
        limit 50 for update skip locked
      ),
      tombstones as (
        update public.media_objects m set status = 'deleted'
        from candidates c where m.bucket = c.bucket and m.path = c.path
        returning m.*
      )
      select coalesce(jsonb_agg(app_private.media_broker_result(t)), '[]'::jsonb)
      into sweep_result from tombstones t;
      return sweep_result;
    end if;
    update public.media_objects set purged_at = statement_timestamp()
    where bucket = p_bucket and path = p_path and status = 'deleted' and purged_at is null
      and upload_until < statement_timestamp() - interval '1 hour';
    return '{}'::jsonb;
  end if;

  -- Take the same couple lock as unlink and account deletion. Recheck
  -- membership after any wait, before locking or allocating an object.
  select c.id into target_couple_id from public.couples c
  join public.couple_members m on m.couple_id = c.id
  where m.user_id = p_actor for update of c;
  if not found or not exists (
    select 1 from public.couple_members m where m.couple_id = target_couple_id and m.user_id = p_actor
  ) then raise exception 'Media operation denied' using errcode = '42501'; end if;

  if p_action = 'health' then return '{}'::jsonb; end if;
  if p_action is null or p_action not in ('reserve', 'lookup', 'commit', 'read', 'delete')
    or p_bucket is null or p_bucket not in ('album-media', 'memory-photos', 'message-media', 'avatars')
    or p_path is null or char_length(p_path) > 220 then
    raise exception 'Invalid media request' using errcode = '22023';
  end if;

  if p_action = 'reserve' then
    couple_prefix := '^r2/' || target_couple_id::text || '/';
    is_raster := coalesce(normalized_type in (
      'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif', 'image/heic', 'image/heif'
    ), false);
    if p_size is null or p_size < 1 or p_size > (case
      when p_bucket = 'album-media' and normalized_type like 'video/%' then 1073741824
      when p_bucket = 'avatars' then 5242880
      else 26214400
    end) or normalized_type is null then
      raise exception 'Invalid media type or size' using errcode = '22023';
    end if;

    case p_bucket
      when 'album-media' then
        if not (
          (is_raster and p_path ~ (couple_prefix || 'album-media/' || uid_pattern || '/' || uid_pattern || '/(thumb|medium|original|poster)\.jpg$'))
          or (p_path ~ (couple_prefix || 'album-media/' || uid_pattern || '/' || uid_pattern || '\.(mp4|webm|mov)$')
            and normalized_type = case path_extension
              when 'mp4' then 'video/mp4' when 'webm' then 'video/webm' when 'mov' then 'video/quicktime' end)
        ) then raise exception 'Invalid media path or type' using errcode = '22023'; end if;
        if not exists (
          select 1 from public.albums a
          where a.id = split_part(p_path, '/', 4)::uuid and a.couple_id = target_couple_id
        ) then raise exception 'Media operation denied' using errcode = '42501'; end if;
      when 'memory-photos' then
        if not is_raster or p_path !~ (couple_prefix || uid_pattern || '/(thumb|medium|original)\.jpg$')
        then raise exception 'Invalid media path or type' using errcode = '22023'; end if;
      when 'message-media' then
        if p_path !~ (couple_prefix || 'messages/voice-capsules/' || uid_pattern || '\.(webm|m4a)$')
          or normalized_type is distinct from (case path_extension
            when 'webm' then 'audio/webm' when 'm4a' then 'audio/mp4' end)
        then raise exception 'Invalid media path or type' using errcode = '22023'; end if;
      when 'avatars' then
        if not is_raster or p_path !~ ('^r2/' || p_actor::text || '/avatar-' || uid_pattern || '\.(jpg|jpeg|png|webp|gif|avif|heic|heif)$')
          or normalized_type <> ('image/' || case when path_extension = 'jpg' then 'jpeg' else path_extension end)
        then raise exception 'Invalid media path or type' using errcode = '22023'; end if;
    end case;

    insert into public.media_objects (bucket, path, couple_id, owner_id, object_key, byte_size, content_type, upload_until)
    values (p_bucket, p_path, target_couple_id, p_actor, target_couple_id::text || '/' || gen_random_uuid()::text,
      p_size, normalized_type, clock_timestamp() + interval '15 minutes')
    on conflict (bucket, path) do nothing
    returning * into asset;
    if found then return app_private.media_broker_result(asset); end if;
  end if;

  select * into asset from public.media_objects
  where bucket = p_bucket and path = p_path and couple_id = target_couple_id for update;
  if not found then raise exception 'Media operation denied' using errcode = '42501'; end if;

  if p_action in ('reserve', 'lookup', 'commit') and asset.owner_id <> p_actor then
    raise exception 'Media operation denied' using errcode = '42501';
  end if;

  case p_action
    when 'reserve' then
      if asset.status = 'deleted' or asset.byte_size <> p_size or asset.content_type <> normalized_type then
        raise exception 'Media reservation conflict' using errcode = '23505';
      end if;
      if asset.status = 'pending' then
        update public.media_objects set upload_until = clock_timestamp() + interval '15 minutes'
        where bucket = p_bucket and path = p_path returning * into asset;
      end if;
    when 'lookup' then
      if asset.status = 'deleted' then raise exception 'Media operation denied' using errcode = '42501'; end if;
    when 'commit' then
      if asset.status = 'deleted' then raise exception 'Media operation denied' using errcode = '42501'; end if;
      if asset.status = 'pending' then
        if p_size is distinct from asset.byte_size or normalized_type is distinct from asset.content_type then
          raise exception 'Uploaded media does not match reservation' using errcode = '22023';
        end if;
        update public.media_objects set status = 'ready'
        where bucket = p_bucket and path = p_path returning * into asset;
      end if;
    when 'read' then
      if asset.status <> 'ready' or (p_bucket = 'avatars' and not exists (
        select 1 from public.couple_members m where m.couple_id = target_couple_id and m.user_id = asset.owner_id
      )) then raise exception 'Media operation denied' using errcode = '42501'; end if;
    when 'delete' then
      if asset.owner_id <> p_actor and (p_bucket <> 'album-media' or asset.status = 'pending') then
        raise exception 'Media operation denied' using errcode = '42501';
      end if;
      if asset.status <> 'deleted' then
        update public.media_objects set status = 'deleted'
        where bucket = p_bucket and path = p_path returning * into asset;
      end if;
  end case;
  return app_private.media_broker_result(asset);
end;
$$;

revoke all on function public.media_broker(text, uuid, text, text, bigint, text)
  from public, anon, authenticated;
grant execute on function public.media_broker(text, uuid, text, text, bigint, text) to service_role;

create function app_private.tombstone_removed_space_media()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.media_objects set status = 'deleted'
  where couple_id = old.id and status <> 'deleted';
  return old;
end;
$$;
revoke all on function app_private.tombstone_removed_space_media() from public, anon, authenticated, service_role;
create trigger tombstone_removed_space_media after delete on public.couples
  for each row execute function app_private.tombstone_removed_space_media();

create function app_private.tombstone_departed_member_media()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.media_objects set status = 'deleted'
  where couple_id = old.couple_id and status <> 'deleted'
    and ((bucket = 'avatars' and owner_id = old.user_id)
      or not exists (select 1 from public.couple_members m where m.couple_id = old.couple_id));
  return old;
end;
$$;
revoke all on function app_private.tombstone_departed_member_media() from public, anon, authenticated, service_role;
create trigger tombstone_departed_member_media after delete on public.couple_members
  for each row execute function app_private.tombstone_departed_member_media();
