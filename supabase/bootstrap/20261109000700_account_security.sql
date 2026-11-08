create table public.account_usernames (
  username text primary key check (username ~ '^[a-z0-9_]{4,20}$'),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.account_recovery_codes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  recovery_hash text not null check (recovery_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);

create table public.edge_rate_limits (
  rate_key text primary key check (char_length(rate_key) between 1 and 300),
  window_started_at timestamptz not null,
  attempt_count integer not null check (attempt_count > 0),
  updated_at timestamptz not null
);

alter table public.account_usernames enable row level security;
alter table public.account_recovery_codes enable row level security;
alter table public.edge_rate_limits enable row level security;
revoke all on public.account_usernames, public.account_recovery_codes, public.edge_rate_limits
  from public, anon, authenticated;
grant select on public.account_usernames to service_role;
grant select, insert, update on public.account_recovery_codes to service_role;

create function app_private.sync_account_username()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  next_username text := lower(new.raw_user_meta_data ->> 'username');
begin
  if new.raw_user_meta_data ->> 'login_type' is distinct from 'username' then return new; end if;
  if next_username is null or next_username !~ '^[a-z0-9_]{4,20}$'
    or lower(new.email) is distinct from 'account.' || next_username || '@users.love-home.invalid' then
    raise exception '账号名格式不正确';
  end if;
  insert into public.account_usernames(username, user_id) values (next_username, new.id);
  return new;
end;
$$;
create trigger on_username_created after insert on auth.users
  for each row execute function app_private.sync_account_username();
revoke all on function app_private.sync_account_username() from public, anon, authenticated;

create function public.consume_account_recovery(p_username text, p_recovery_hash text)
returns uuid
language sql security definer set search_path = ''
as $$
  delete from public.account_recovery_codes r
  using public.account_usernames a
  where a.user_id = r.user_id and a.username = p_username and r.recovery_hash = p_recovery_hash
  returning r.user_id;
$$;

create function public.consume_edge_rate_limit(p_key text, p_window_seconds integer, p_max_attempts integer)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  attempts integer;
  stamp timestamptz := clock_timestamp();
begin
  if p_key is null or char_length(p_key) not between 1 and 300
    or p_window_seconds is null or p_window_seconds < 1 or p_max_attempts is null or p_max_attempts < 1 then
    raise exception '限流参数无效';
  end if;
  insert into public.edge_rate_limits as limits(rate_key, window_started_at, attempt_count, updated_at)
  values (p_key, stamp, 1, stamp)
  on conflict (rate_key) do update set
    window_started_at = case
      when stamp - limits.window_started_at >= make_interval(secs => p_window_seconds) then stamp
      else limits.window_started_at end,
    attempt_count = case
      when stamp - limits.window_started_at >= make_interval(secs => p_window_seconds) then 1
      else least(limits.attempt_count::bigint + 1, 2147483647)::integer end,
    updated_at = greatest(stamp, limits.updated_at)
  returning attempt_count into attempts;
  return attempts <= p_max_attempts;
end;
$$;

create function public.prepare_account_deletion()
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception '请先登录'; end if;
  -- Kept for the existing Edge Function contract. Only the Auth deletion
  -- transaction below may modify the workspace.
end;
$$;

create function app_private.on_auth_user_deletion()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  target_couple_id uuid;
begin
  select c.id into target_couple_id
  from public.couples c join public.couple_members m on m.couple_id = c.id
  where m.user_id = old.id for update of c;
  if found and not exists (
    select 1 from public.couple_members where couple_id = target_couple_id and user_id <> old.id
  ) then
    delete from public.couples where id = target_couple_id;
  end if;
  -- In a shared space the profile/member cascade preserves remaining access
  -- and the member trigger closes the space to new invitations.
  return old;
end;
$$;
create trigger on_auth_user_deletion before delete on auth.users
  for each row execute function app_private.on_auth_user_deletion();
revoke all on function app_private.on_auth_user_deletion() from public, anon, authenticated;

revoke all on function public.consume_account_recovery(text, text),
  public.consume_edge_rate_limit(text, integer, integer), public.prepare_account_deletion()
  from public, anon, authenticated;
grant execute on function public.consume_account_recovery(text, text),
  public.consume_edge_rate_limit(text, integer, integer) to service_role;
grant execute on function public.prepare_account_deletion() to authenticated;
