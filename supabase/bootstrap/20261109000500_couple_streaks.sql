-- All dates are server business dates in Asia/Shanghai. Clients can only
-- confirm the date shown in the UI, never supply a different historical day.
create table public.couple_streaks (
  couple_id uuid primary key references public.couples(id) on delete cascade,
  current_days integer not null default 0 check (current_days >= 0),
  longest_days integer not null default 0 check (longest_days >= current_days),
  last_completed_date date,
  protection_count integer not null default 0 check (protection_count between 0 and 3),
  updated_at timestamptz not null default now()
);

create table public.streak_day_actions (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  activity_date date not null,
  user_id uuid references public.profiles(id) on delete set null,
  request_id uuid not null,
  activity_type text not null default 'manual' check (activity_type = 'manual'),
  mood integer check (mood between 1 and 5),
  note text check (char_length(note) <= 240),
  created_at timestamptz not null default now(),
  unique (couple_id, activity_date, user_id),
  unique (couple_id, user_id, request_id)
);

create table public.streak_day_results (
  couple_id uuid not null references public.couples(id) on delete cascade,
  activity_date date not null,
  streak_days integer not null check (streak_days > 0),
  protection_used boolean not null,
  protection_earned boolean not null,
  completed_at timestamptz not null default now(),
  primary key (couple_id, activity_date)
);

do $$
declare
  table_name text;
begin
  foreach table_name in array array['couple_streaks', 'streak_day_actions', 'streak_day_results']
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on public.%I from public, anon, authenticated', table_name);
    execute format('grant select on public.%I to authenticated', table_name);
    execute format('create policy select_member on public.%I for select to authenticated using (public.is_couple_member(couple_id))', table_name);
  end loop;
end;
$$;

create function app_private.streak_status_for_day(target_couple_id uuid, today date)
returns jsonb
language plpgsql stable set search_path = ''
as $$
declare
  state public.couple_streaks;
  actors jsonb;
  actions jsonb;
  completed boolean;
begin
  select * into state from public.couple_streaks where couple_id = target_couple_id;

  select coalesce(jsonb_agg(a.user_id order by a.created_at, a.id), '[]'::jsonb),
    coalesce(jsonb_agg(jsonb_build_object('user_id', a.user_id, 'activity_type', a.activity_type,
      'mood', a.mood, 'note', a.note, 'created_at', a.created_at) order by a.created_at, a.id), '[]'::jsonb)
  into actors, actions
  from public.streak_day_actions a join public.couple_members m using (couple_id, user_id)
  where a.couple_id = target_couple_id and a.activity_date = today;

  select exists (select 1 from public.streak_day_results where couple_id = target_couple_id and activity_date = today)
  into completed;
  return jsonb_build_object(
    'today', today, 'today_action_count', jsonb_array_length(actors),
    'today_completed', completed, 'today_actor_ids', actors, 'today_actions', actions,
    'streak', jsonb_build_object(
      'current_days', case
        when state.last_completed_date >= today - 1 then state.current_days
        when state.last_completed_date = today - 2 and state.protection_count > 0 then state.current_days
        else 0 end,
      'longest_days', coalesce(state.longest_days, 0),
      'last_completed_date', state.last_completed_date,
      'protection_count', coalesce(state.protection_count, 0)
    )
  );
end;
$$;
revoke all on function app_private.streak_status_for_day(uuid, date) from public, anon, authenticated;

create function public.get_couple_streak_status()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  target_couple_id uuid;
begin
  select couple_id into target_couple_id from public.couple_members where user_id = auth.uid();
  if not found then raise exception '请先绑定情侣空间'; end if;
  return app_private.streak_status_for_day(target_couple_id, (statement_timestamp() at time zone 'Asia/Shanghai')::date);
end;
$$;

create function public.check_in_couple(
  p_request_id uuid, p_expected_date date, p_mood integer default null, p_note text default null
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  space public.couples;
  today date;
  state public.couple_streaks;
  next_days integer;
  used boolean := false;
  earned boolean := false;
begin
  -- The same row lock serializes invitation, leave and both check-in writers.
  select c.* into space
  from public.couples c join public.couple_members m on m.couple_id = c.id
  where m.user_id = actor_id for update of c;
  if not found or space.closed_at is not null or not public.is_couple_member(space.id) then
    raise exception '当前没有可以打卡的情侣空间';
  end if;
  today := (clock_timestamp() at time zone 'Asia/Shanghai')::date;
  if p_expected_date is distinct from today then raise exception '日期已变更，请刷新后再打卡'; end if;
  if p_request_id is null then raise exception '缺少打卡请求编号'; end if;

  insert into public.streak_day_actions (couple_id, activity_date, user_id, request_id, mood, note)
  values (space.id, today, actor_id, p_request_id, p_mood, nullif(btrim(p_note), ''))
  on conflict do nothing;
  if not found then return app_private.streak_status_for_day(space.id, today); end if;
  if (select count(*) from public.streak_day_actions a join public.couple_members m using (couple_id, user_id)
      where a.couple_id = space.id and a.activity_date = today) <> 2 then
    return app_private.streak_status_for_day(space.id, today);
  end if;

  insert into public.couple_streaks (couple_id) values (space.id) on conflict do nothing;
  select * into state from public.couple_streaks where couple_id = space.id;
  if state.last_completed_date = today then return app_private.streak_status_for_day(space.id, today); end if;
  used := coalesce(state.last_completed_date = today - 2 and state.protection_count > 0, false);
  next_days := case when state.last_completed_date = today - 1 or used then state.current_days + 1 else 1 end;
  earned := next_days % 7 = 0;

  insert into public.streak_day_results (couple_id, activity_date, streak_days, protection_used, protection_earned)
  values (space.id, today, next_days, used, earned);
  update public.couple_streaks
  set current_days = next_days, longest_days = greatest(state.longest_days, next_days),
    last_completed_date = today,
    protection_count = least(3, state.protection_count - used::integer + earned::integer),
    updated_at = clock_timestamp()
  where couple_id = space.id;

  return app_private.streak_status_for_day(space.id, today) || jsonb_build_object(
    'newly_completed', true, 'protection_used', used, 'protection_earned', earned
  );
end;
$$;

create function public.get_couple_streak_history(p_month date default null)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  target_couple_id uuid;
  month_start date := date_trunc('month', coalesce(p_month, (now() at time zone 'Asia/Shanghai')::date))::date;
  month_end date := (month_start + interval '1 month')::date;
begin
  select couple_id into target_couple_id from public.couple_members where user_id = auth.uid();
  if not found then raise exception '请先绑定情侣空间'; end if;
  return (
    with actions as (
      select * from public.streak_day_actions
      where couple_id = target_couple_id and activity_date >= month_start and activity_date < month_end
    ),
    days as (
      select a.activity_date, count(*) as count, jsonb_agg(a.user_id order by a.created_at, a.id) as actor_ids,
        jsonb_agg(distinct a.activity_type) as sources, r.activity_date is not null as completed,
        coalesce(r.protection_used, false) as protection_used
      from actions a left join public.streak_day_results r using (couple_id, activity_date)
      group by a.activity_date, r.activity_date, r.protection_used
    ),
    milestones as (
      select streak_days as days, min(completed_at) as achieved_at
      from public.streak_day_results
      where couple_id = target_couple_id and streak_days in (3, 7, 14, 30, 100)
      group by streak_days
    )
    select jsonb_build_object(
      'month', month_start,
      'days', coalesce((select jsonb_agg((to_jsonb(d) - 'activity_date') || jsonb_build_object('date', d.activity_date)
        order by d.activity_date) from days d), '[]'::jsonb),
      'events', coalesce((select jsonb_agg(jsonb_build_object('date', a.activity_date, 'actor_id', a.user_id,
        'activity_type', a.activity_type, 'mood', a.mood, 'note', a.note, 'created_at', a.created_at)
        order by a.created_at desc, a.id) from actions a), '[]'::jsonb),
      'milestones', coalesce((select jsonb_agg(to_jsonb(m) order by m.days) from milestones m), '[]'::jsonb)
    )
  );
end;
$$;

revoke all on function public.get_couple_streak_status(), public.check_in_couple(uuid, date, integer, text),
  public.get_couple_streak_history(date) from public, anon, authenticated;
grant execute on function public.get_couple_streak_status(), public.check_in_couple(uuid, date, integer, text),
  public.get_couple_streak_history(date) to authenticated;
