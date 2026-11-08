-- Personal topics stay safe after a membership changes, even if the socket
-- remains connected. Only the database emits events, and only the user reads them.
create policy member_refresh_select_own_topic
  on realtime.messages for select to authenticated
  using (
    extension = 'broadcast'
    and (select realtime.topic()) = 'member-updates:' || (select auth.uid())::text
  );

create function app_private.emit_member_refresh(target_couple_id uuid, changed_user_id uuid)
returns void
language sql set search_path = ''
as $$
  select realtime.send('{}'::jsonb, 'members_changed', 'member-updates:' || recipient.id::text, true)
  from (
    select m.user_id as id from public.couple_members m where m.couple_id = target_couple_id
    union
    select changed_user_id
  ) recipient;
$$;

create function app_private.on_member_refresh()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform app_private.emit_member_refresh(old.couple_id, old.user_id);
  else
    perform app_private.emit_member_refresh(new.couple_id, new.user_id);
  end if;
  return null;
end;
$$;

create trigger notify_member_refresh after insert or delete on public.couple_members
  for each row execute function app_private.on_member_refresh();

create function app_private.on_member_profile_refresh()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  target_couple_id uuid;
begin
  select couple_id into target_couple_id from public.couple_members where user_id = new.id;
  if found then
    perform app_private.emit_member_refresh(target_couple_id, new.id);
  end if;
  return null;
end;
$$;

create trigger notify_member_profile_refresh
  after update of display_name, avatar_url on public.profiles
  for each row when (old.display_name is distinct from new.display_name or old.avatar_url is distinct from new.avatar_url)
  execute function app_private.on_member_profile_refresh();

revoke all on function app_private.emit_member_refresh(uuid, uuid),
  app_private.on_member_refresh(), app_private.on_member_profile_refresh()
  from public, anon, authenticated;
