create table public.activity_events (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  kind text not null check (kind in (
    'message', 'memory', 'photo', 'album', 'calendar', 'list', 'anniversary', 'letter', 'mood', 'question', 'voice', 'system'
  )),
  target text not null check (target in ('首页', '悄悄话', '时光', '相册', '清单', '纪念日', '日历')),
  entity_id text not null,
  operation text not null check (operation in ('INSERT', 'UPDATE', 'DELETE')),
  title text not null,
  body text not null default '',
  created_at timestamptz not null default now()
);
create index activity_events_couple_created_idx on public.activity_events(couple_id, created_at desc);
alter table public.activity_events enable row level security;
revoke all on public.activity_events from public, anon, authenticated;
grant select on public.activity_events to authenticated;
create policy select_member on public.activity_events for select to authenticated
  using (public.is_couple_member(couple_id));

create function app_private.emit_couple_activity_event()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  target_couple_id uuid;
  target_id uuid;
begin
  if actor_id is null then return null; end if;
  if tg_op = 'DELETE' then
    target_couple_id := old.couple_id;
    target_id := old.id;
  else
    target_couple_id := new.couple_id;
    target_id := new.id;
  end if;
  -- Cascading removal of a whole space must not create a new child row.
  if not public.is_couple_member(target_couple_id)
    or not exists (select 1 from public.couples where id = target_couple_id) then return null; end if;
  insert into public.activity_events(couple_id, actor_id, kind, target, entity_id, operation, title)
  values (target_couple_id, actor_id, tg_argv[0], tg_argv[1], target_id::text, tg_op,
    case tg_op when 'DELETE' then '删除了一项内容' when 'UPDATE' then '更新了一项内容' else tg_argv[2] end);
  return null;
end;
$$;
revoke all on function app_private.emit_couple_activity_event() from public, anon, authenticated;

create trigger emit_couple_activity after insert or delete on public.messages
  for each row execute function app_private.emit_couple_activity_event('message', '悄悄话', '发来了一条悄悄话');
create trigger emit_couple_activity after insert or update or delete on public.memories
  for each row execute function app_private.emit_couple_activity_event('memory', '时光', '记录了一段时光');
create trigger emit_couple_activity after insert or delete on public.album_photos
  for each row execute function app_private.emit_couple_activity_event('photo', '相册', '添加了照片或视频');
create trigger emit_couple_activity after insert or update or delete on public.albums
  for each row execute function app_private.emit_couple_activity_event('album', '相册', '创建了一个相册');
create trigger emit_couple_activity after insert or update or delete on public.shared_events
  for each row execute function app_private.emit_couple_activity_event('calendar', '日历', '添加了一个日历事件');
create trigger emit_couple_activity after insert or update or delete on public.shared_event_tasks
  for each row execute function app_private.emit_couple_activity_event('calendar', '日历', '添加了一个日历任务');
create trigger emit_couple_activity after insert or update or delete on public.together_items
  for each row execute function app_private.emit_couple_activity_event('list', '清单', '添加了一项共同清单');
create trigger emit_couple_activity after insert or update or delete on public.anniversaries
  for each row execute function app_private.emit_couple_activity_event('anniversary', '纪念日', '添加了一个纪念日');
create trigger emit_couple_activity after insert or delete on public.couple_letters
  for each row execute function app_private.emit_couple_activity_event('letter', '悄悄话', '写了一封情书');
create trigger emit_couple_activity after insert or delete on public.mood_checkins
  for each row execute function app_private.emit_couple_activity_event('mood', '首页', '完成了今日心情');
create trigger emit_couple_activity after insert or update on public.daily_answers
  for each row execute function app_private.emit_couple_activity_event('question', '首页', '回答了每日问题');
create trigger emit_couple_activity after insert or delete on public.voice_capsules
  for each row execute function app_private.emit_couple_activity_event('voice', '悄悄话', '留下了一段声音');

-- DELETE events do not apply row-level filtering in Supabase Realtime.
-- Clients can consume the authorized activity INSERTs and refetch removals.
alter publication supabase_realtime set (publish = 'insert, update');
alter publication supabase_realtime add table public.activity_events, public.messages, public.album_photos,
  public.together_items, public.anniversaries, public.couple_letters, public.voice_capsules,
  public.mood_checkins, public.daily_answers, public.shared_events, public.shared_event_tasks,
  public.couple_streaks, public.streak_day_actions, public.streak_day_results;
