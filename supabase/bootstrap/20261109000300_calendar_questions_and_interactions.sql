create table public.mood_checkins (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  mood text not null check (mood in ('happy', 'love', 'calm', 'sad', 'angry', 'anxious', 'excited', 'tired')),
  note text,
  mood_date date not null default ((now() at time zone 'Asia/Shanghai')::date),
  created_at timestamptz not null default now(),
  unique (couple_id, user_id, mood_date)
);
create index mood_checkins_couple_date_idx on public.mood_checkins(couple_id, mood_date desc);

create table public.daily_questions (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  question_text text not null,
  question_date date not null default ((now() at time zone 'Asia/Shanghai')::date),
  created_at timestamptz not null default now(),
  unique (couple_id, question_date),
  unique (id, couple_id)
);

create table public.daily_answers (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null,
  couple_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  answer_text text not null check (char_length(btrim(answer_text)) > 0),
  created_at timestamptz not null default now(),
  unique (question_id, user_id),
  foreign key (question_id, couple_id) references public.daily_questions(id, couple_id) on delete cascade
);
create index daily_answers_couple_idx on public.daily_answers(couple_id);

create table public.shared_events (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  title text not null,
  description text,
  event_date date not null,
  event_time time,
  event_type text not null default 'other' check (event_type in ('date', 'schedule', 'class', 'reminder', 'birthday', 'other')),
  location text,
  repeat_rule text not null default 'none' check (repeat_rule in ('none', 'daily', 'weekly', 'monthly', 'yearly', 'weekdays')),
  repeat_until date,
  reminder_minutes integer[] not null default '{}',
  status text not null default 'planned' check (status in ('planned', 'done', 'cancelled')),
  budget numeric(10, 2),
  memory_id uuid,
  created_at timestamptz not null default now(),
  unique (id, couple_id),
  foreign key (memory_id, couple_id) references public.memories(id, couple_id) on delete set null (memory_id)
);
create index shared_events_couple_date_idx on public.shared_events(couple_id, event_date);

create table public.shared_event_tasks (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null,
  couple_id uuid not null,
  created_by uuid references public.profiles(id) on delete set null,
  title text not null check (char_length(title) between 1 and 160),
  completed boolean not null default false,
  completed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (event_id, couple_id) references public.shared_events(id, couple_id) on delete cascade
);
create index shared_event_tasks_event_idx on public.shared_event_tasks(event_id, completed, created_at);
create index shared_event_tasks_couple_idx on public.shared_event_tasks(couple_id);

create table public.memory_favorites (
  memory_id uuid not null,
  couple_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (memory_id, user_id),
  foreign key (memory_id, couple_id) references public.memories(id, couple_id) on delete cascade
);
create table public.memory_reactions (
  memory_id uuid not null,
  couple_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 8),
  created_at timestamptz not null default now(),
  primary key (memory_id, user_id, emoji),
  foreign key (memory_id, couple_id) references public.memories(id, couple_id) on delete cascade
);
create table public.memory_comments (
  id uuid primary key default gen_random_uuid(),
  memory_id uuid not null,
  couple_id uuid not null,
  user_id uuid references public.profiles(id) on delete set null,
  content text not null check (char_length(content) between 1 and 240),
  created_at timestamptz not null default now(),
  foreign key (memory_id, couple_id) references public.memories(id, couple_id) on delete cascade
);
create index memory_comments_memory_idx on public.memory_comments(memory_id, created_at desc);

create table public.couple_easter_eggs (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null unique references public.couples(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  secret_hash text not null check (char_length(secret_hash) between 32 and 128),
  title text not null default '只属于我们的秘密' check (char_length(btrim(title)) between 1 and 100),
  content text not null check (char_length(btrim(content)) between 1 and 3000),
  media_path text,
  media_type text check (media_type in ('image', 'video')),
  audio_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.story_share_links (
  token uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '72 hours'),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index story_share_links_couple_idx on public.story_share_links(couple_id, created_at desc);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'mood_checkins', 'daily_questions', 'daily_answers', 'shared_events', 'shared_event_tasks',
    'memory_favorites', 'memory_reactions', 'memory_comments', 'couple_easter_eggs', 'story_share_links'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on public.%I from public, anon, authenticated', table_name);
    execute format('grant select on public.%I to authenticated', table_name);
    if table_name <> 'daily_answers' then
      execute format('create policy select_member on public.%I for select to authenticated using (public.is_couple_member(couple_id))', table_name);
    end if;
  end loop;
end;
$$;

grant insert (couple_id, user_id, mood, note, mood_date),
  update (couple_id, user_id, mood, note, mood_date), delete on public.mood_checkins to authenticated;
create policy insert_own on public.mood_checkins for insert to authenticated
  with check (public.is_couple_member(couple_id) and user_id = auth.uid());
create policy update_own on public.mood_checkins for update to authenticated
  using (public.is_couple_member(couple_id) and user_id = auth.uid())
  with check (public.is_couple_member(couple_id) and user_id = auth.uid());
create policy delete_own on public.mood_checkins for delete to authenticated
  using (public.is_couple_member(couple_id) and user_id = auth.uid());

create function app_private.keep_mood_identity()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if (new.couple_id, new.user_id, new.mood_date) is distinct from (old.couple_id, old.user_id, old.mood_date) then
    raise exception '不能修改心情记录的归属或日期';
  end if;
  return new;
end;
$$;
create trigger keep_mood_identity before update on public.mood_checkins
  for each row execute function app_private.keep_mood_identity();
revoke all on function app_private.keep_mood_identity() from public, anon, authenticated;

grant insert (couple_id, question_text, question_date) on public.daily_questions to authenticated;
create policy insert_member on public.daily_questions for insert to authenticated
  with check (public.is_couple_member(couple_id));

create function app_private.has_answered(target_question_id uuid, target_couple_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.daily_answers a
    where a.question_id = target_question_id and a.couple_id = target_couple_id and a.user_id = auth.uid()
  );
$$;
revoke all on function app_private.has_answered(uuid, uuid) from public, anon, authenticated;
grant execute on function app_private.has_answered(uuid, uuid) to authenticated;

grant insert (question_id, couple_id, user_id, answer_text), update (question_id, couple_id, user_id, answer_text)
  on public.daily_answers to authenticated;
create policy select_after_answering on public.daily_answers for select to authenticated
  using (public.is_couple_member(couple_id) and (user_id = auth.uid() or app_private.has_answered(question_id, couple_id)));
create policy insert_own on public.daily_answers for insert to authenticated
  with check (public.is_couple_member(couple_id) and user_id = auth.uid());
create policy update_own on public.daily_answers for update to authenticated
  using (public.is_couple_member(couple_id) and user_id = auth.uid())
  with check (public.is_couple_member(couple_id) and user_id = auth.uid());

-- PostgREST upserts assign the conflict columns even when their values stay unchanged.
create function app_private.keep_answer_identity()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if (new.question_id, new.couple_id, new.user_id) is distinct from (old.question_id, old.couple_id, old.user_id) then
    raise exception '不能修改回答的归属';
  end if;
  return new;
end;
$$;
create trigger keep_answer_identity before update on public.daily_answers
  for each row execute function app_private.keep_answer_identity();
revoke all on function app_private.keep_answer_identity() from public, anon, authenticated;

grant insert (couple_id, created_by, title, description, event_date, event_time, event_type, location, repeat_rule, repeat_until, reminder_minutes, status, budget, memory_id),
  update (title, description, event_date, event_time, event_type, location, repeat_rule, repeat_until, reminder_minutes, status, budget, memory_id), delete
  on public.shared_events to authenticated;
create policy insert_creator on public.shared_events for insert to authenticated
  with check (public.is_couple_member(couple_id) and created_by = auth.uid());
create policy update_member on public.shared_events for update to authenticated
  using (public.is_couple_member(couple_id)) with check (public.is_couple_member(couple_id));
create policy delete_member on public.shared_events for delete to authenticated
  using (public.is_couple_member(couple_id));

grant insert (event_id, couple_id, created_by, title), update (title, completed, completed_by, updated_at), delete
  on public.shared_event_tasks to authenticated;
create policy insert_creator on public.shared_event_tasks for insert to authenticated
  with check (public.is_couple_member(couple_id) and created_by = auth.uid());
create policy update_member on public.shared_event_tasks for update to authenticated
  using (public.is_couple_member(couple_id))
  with check (public.is_couple_member(couple_id) and (completed_by is null or exists (
    select 1 from public.couple_members m where m.couple_id = shared_event_tasks.couple_id and m.user_id = completed_by
  )));
create policy delete_creator on public.shared_event_tasks for delete to authenticated
  using (public.is_couple_member(couple_id) and created_by = auth.uid());

grant insert (memory_id, couple_id, user_id), delete on public.memory_favorites to authenticated;
grant insert (memory_id, couple_id, user_id, emoji), delete on public.memory_reactions to authenticated;
grant insert (memory_id, couple_id, user_id, content), delete on public.memory_comments to authenticated;
do $$
declare
  table_name text;
begin
  foreach table_name in array array['memory_favorites', 'memory_reactions', 'memory_comments']
  loop
    execute format('create policy insert_own on public.%I for insert to authenticated with check (public.is_couple_member(couple_id) and user_id = auth.uid())', table_name);
    execute format('create policy delete_own on public.%I for delete to authenticated using (public.is_couple_member(couple_id) and user_id = auth.uid())', table_name);
  end loop;
end;
$$;

grant insert (couple_id, created_by, secret_hash, title, content, media_path, media_type, audio_path),
  update (couple_id, created_by, secret_hash, title, content, media_path, media_type, audio_path), delete
  on public.couple_easter_eggs to authenticated;
create policy insert_creator on public.couple_easter_eggs for insert to authenticated
  with check (public.is_couple_member(couple_id) and created_by = auth.uid());
create policy update_member on public.couple_easter_eggs for update to authenticated
  using (public.is_couple_member(couple_id))
  with check (public.is_couple_member(couple_id) and created_by = auth.uid());
create policy delete_creator on public.couple_easter_eggs for delete to authenticated
  using (public.is_couple_member(couple_id) and created_by = auth.uid());

grant insert (token, couple_id, created_by, expires_at), update (revoked_at) on public.story_share_links to authenticated;
create policy insert_creator on public.story_share_links for insert to authenticated
  with check (public.is_couple_member(couple_id) and created_by = auth.uid());
create policy revoke_creator on public.story_share_links for update to authenticated
  using (public.is_couple_member(couple_id) and created_by = auth.uid())
  with check (public.is_couple_member(couple_id) and created_by = auth.uid());
