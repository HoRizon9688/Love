-- First migration for a fresh Supabase project. Never apply over the legacy schema.
create schema app_private;
revoke all on schema app_private from public, anon, authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 40),
  avatar_url text,
  last_login_user_agent text,
  last_login_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.couples (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 40),
  relationship_start date not null,
  cover_path text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

create table public.couple_members (
  couple_id uuid not null references public.couples(id) on delete cascade,
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  slot smallint not null check (slot in (1, 2)),
  joined_at timestamptz not null default now(),
  primary key (couple_id, user_id),
  unique (couple_id, slot)
);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  code_hash bytea not null unique check (octet_length(code_hash) = 32),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  revoked_at timestamptz,
  accepted_at timestamptz,
  accepted_by uuid references public.profiles(id) on delete set null
);

create unique index invitations_one_pending_per_couple
  on public.invitations(couple_id) where revoked_at is null and accepted_at is null;

create function app_private.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, left(coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
    nullif(btrim(split_part(new.email, '@', 1)), ''),
    '成员'
  ), 40));
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function app_private.handle_new_user();

create function public.is_couple_member(target_couple_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.couple_members
    where couple_id = target_couple_id and user_id = auth.uid()
  );
$$;

-- Callers hold the couple lock, or have just created that couple in this transaction.
create function app_private.issue_couple_invitation(target_couple_id uuid, actor_id uuid)
returns text
language plpgsql set search_path = ''
as $$
declare
  new_code text := upper(replace(gen_random_uuid()::text, '-', ''));
begin
  update public.invitations set revoked_at = clock_timestamp()
  where couple_id = target_couple_id and accepted_at is null and revoked_at is null;
  insert into public.invitations (couple_id, created_by, code_hash)
  values (target_couple_id, actor_id, sha256(convert_to(new_code, 'UTF8')));
  return new_code;
end;
$$;

create function public.create_couple_with_invitation(couple_name text, relationship_start date)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  new_couple_id uuid;
begin
  if actor_id is null then raise exception '请先登录'; end if;
  if relationship_start is null or relationship_start > (now() at time zone 'Asia/Shanghai')::date then
    raise exception '请输入有效的在一起日期';
  end if;
  if exists (select 1 from public.couple_members where user_id = actor_id) then
    raise exception '你已经加入了一个情侣空间';
  end if;
  insert into public.couples (name, relationship_start, created_by)
  values (btrim(couple_name), relationship_start, actor_id) returning id into new_couple_id;
  insert into public.couple_members (couple_id, user_id, slot) values (new_couple_id, actor_id, 1);
  return app_private.issue_couple_invitation(new_couple_id, actor_id);
end;
$$;

create function public.regenerate_couple_invitation()
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  space public.couples;
begin
  select c.* into space
  from public.couples c join public.couple_members m on m.couple_id = c.id
  where m.user_id = actor_id for update of c;
  if not found or space.closed_at is not null or not public.is_couple_member(space.id) then
    raise exception '空间已关闭或你尚未加入';
  end if;
  if (select count(*) from public.couple_members where couple_id = space.id) >= 2 then
    raise exception '这个空间已经有两位成员';
  end if;
  return app_private.issue_couple_invitation(space.id, actor_id);
end;
$$;

create function public.accept_couple_invitation(invitation_code text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  normalized text := upper(btrim(invitation_code));
  wanted_hash bytea;
  space public.couples;
  invitation public.invitations;
  available_slot smallint;
begin
  if actor_id is null then raise exception '请先登录'; end if;
  if normalized is null or normalized !~ '^[0-9A-F]{32}$' then
    raise exception '邀请码无效或已过期';
  end if;
  wanted_hash := sha256(convert_to(normalized, 'UTF8'));

  -- All membership changes lock the couple first, then recheck the invitation.
  select c.* into space
  from public.couples c join public.invitations i on i.couple_id = c.id
  where i.code_hash = wanted_hash for update of c;
  if not found or space.closed_at is not null then raise exception '邀请码无效或已过期'; end if;

  select i.* into invitation
  from public.invitations i
  where i.code_hash = wanted_hash and i.couple_id = space.id for update;
  if not found or invitation.accepted_at is not null or invitation.revoked_at is not null
    or invitation.expires_at <= clock_timestamp()
    or not exists (select 1 from public.couple_members
                   where couple_id = space.id and user_id = invitation.created_by) then
    raise exception '邀请码无效或已过期';
  end if;
  if exists (select 1 from public.couple_members where user_id = actor_id) then
    raise exception '你已经加入了一个情侣空间';
  end if;

  select candidate into available_slot from generate_series(1, 2) as candidate
  where not exists (select 1 from public.couple_members
                    where couple_id = space.id and slot = candidate)
  order by candidate limit 1;
  if available_slot is null then raise exception '这个空间已经有两位成员'; end if;
  insert into public.couple_members (couple_id, user_id, slot) values (space.id, actor_id, available_slot);
  update public.invitations set accepted_at = clock_timestamp(), accepted_by = actor_id
  where id = invitation.id;
end;
$$;

create function public.leave_couple_space()
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  target_couple_id uuid;
begin
  select c.id into target_couple_id
  from public.couples c join public.couple_members m on m.couple_id = c.id
  where m.user_id = actor_id for update of c;
  if not found then return; end if;
  delete from public.couple_members where couple_id = target_couple_id and user_id = actor_id;
end;
$$;

-- Covers both explicit unbinding and membership removal by Auth/profile cascades.
create function app_private.close_couple_after_member_leaves()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.couples set closed_at = clock_timestamp()
  where id = old.couple_id and closed_at is null;
  if found then
    update public.invitations set revoked_at = clock_timestamp()
    where couple_id = old.couple_id and accepted_at is null and revoked_at is null;
  end if;
  return old;
end;
$$;

create trigger close_couple_after_member_leaves after delete on public.couple_members
  for each row execute function app_private.close_couple_after_member_leaves();

create function public.get_couple_profiles()
returns table(user_id uuid, display_name text, avatar_url text)
language sql stable security definer set search_path = ''
as $$
  select p.id, p.display_name, p.avatar_url
  from public.couple_members own
  join public.couple_members m on m.couple_id = own.couple_id
  join public.profiles p on p.id = m.user_id
  where own.user_id = auth.uid()
  order by m.slot;
$$;

alter table public.profiles enable row level security;
alter table public.couples enable row level security;
alter table public.couple_members enable row level security;
alter table public.invitations enable row level security;

create policy profiles_select_self on public.profiles
  for select to authenticated using (id = auth.uid());
create policy profiles_update_self on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy couples_select_member on public.couples
  for select to authenticated using (public.is_couple_member(id));
create policy couples_update_member on public.couples
  for update to authenticated using (public.is_couple_member(id)) with check (public.is_couple_member(id));
create policy members_select_member on public.couple_members
  for select to authenticated using (public.is_couple_member(couple_id));

revoke all on public.profiles, public.couples, public.couple_members, public.invitations
  from public, anon, authenticated;
grant select on public.profiles, public.couples, public.couple_members to authenticated;
grant update (display_name, avatar_url) on public.profiles to authenticated;
grant update (name, relationship_start, cover_path) on public.couples to authenticated;
grant select, update on public.profiles to service_role;

revoke all on function app_private.handle_new_user(), app_private.issue_couple_invitation(uuid, uuid),
  app_private.close_couple_after_member_leaves()
  from public, anon, authenticated;
revoke all on function public.is_couple_member(uuid), public.create_couple_with_invitation(text, date),
  public.regenerate_couple_invitation(), public.accept_couple_invitation(text),
  public.leave_couple_space(), public.get_couple_profiles()
  from public, anon, authenticated;
grant execute on function public.is_couple_member(uuid), public.create_couple_with_invitation(text, date),
  public.regenerate_couple_invitation(), public.accept_couple_invitation(text),
  public.leave_couple_space(), public.get_couple_profiles() to authenticated;

-- Keep raw membership rows out of Postgres Changes. DELETE events can expose
-- old primary keys without RLS; clients need a scoped membership event instead.
