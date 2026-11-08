-- Final empty-project shapes of the retained shared content tables.
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  sender_id uuid references public.profiles(id) on delete set null,
  content text check (char_length(content) <= 2000 and content !~ '^::location:'),
  image_path text,
  media_path text,
  media_type text check (media_type in ('image', 'video', 'audio')),
  media_poster_path text,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  check (content is not null or image_path is not null or media_path is not null)
);
create index messages_couple_created_idx on public.messages(couple_id, created_at desc, id);

create table public.memories (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  content text not null check (char_length(content) between 1 and 1000),
  memory_date date not null,
  location text check (char_length(location) <= 80),
  photos jsonb not null default '[]' check (jsonb_typeof(photos) = 'array' and jsonb_array_length(photos) <= 6),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, couple_id)
);
create index memories_couple_created_idx on public.memories(couple_id, created_at desc);

create table public.albums (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  name text not null check (char_length(name) between 1 and 40),
  description text check (char_length(description) <= 160),
  cover_path text,
  created_at timestamptz not null default now(),
  unique (id, couple_id)
);
create index albums_couple_created_idx on public.albums(couple_id, created_at desc);

create table public.album_photos (
  id uuid primary key default gen_random_uuid(),
  album_id uuid not null,
  couple_id uuid not null,
  uploaded_by uuid references public.profiles(id) on delete set null,
  path text not null unique,
  thumb_path text,
  medium_path text,
  original_path text,
  video_poster_path text,
  media_type text not null default 'image' check (media_type in ('image', 'video')),
  caption text check (char_length(caption) <= 200),
  taken_date date not null default current_date,
  created_at timestamptz not null default now(),
  foreign key (album_id, couple_id) references public.albums(id, couple_id) on delete cascade
);
create index album_photos_couple_taken_idx on public.album_photos(couple_id, taken_date desc);
create index album_photos_album_idx on public.album_photos(album_id);

-- Older callers send album_id only. Resolve the space through the visible parent.
create function app_private.set_photo_couple()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.couple_id is null then
    select a.couple_id into new.couple_id from public.albums a where a.id = new.album_id;
  end if;
  return new;
end;
$$;
create trigger set_photo_couple before insert on public.album_photos
  for each row execute function app_private.set_photo_couple();

create table public.together_items (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  title text not null check (char_length(title) between 1 and 100),
  note text check (char_length(note) <= 500),
  category text not null check (category in ('wish', 'travel', 'movie', 'date')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high')),
  planned_date date,
  completed boolean not null default false,
  completed_by uuid references public.profiles(id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index together_items_couple_idx on public.together_items(couple_id, completed, created_at desc);

create table public.anniversaries (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  title text not null check (char_length(title) between 1 and 80),
  event_date date not null,
  kind text not null default 'custom' check (kind in ('anniversary', 'birthday', 'travel', 'custom')),
  recurring boolean not null default true,
  note text check (char_length(note) <= 300),
  created_at timestamptz not null default now()
);
create index anniversaries_couple_date_idx on public.anniversaries(couple_id, event_date);

create table public.couple_letters (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  sender_id uuid references public.profiles(id) on delete set null,
  recipient_id uuid references public.profiles(id) on delete set null,
  content text not null check (char_length(content) between 1 and 1200),
  created_at timestamptz not null default now(),
  check (sender_id <> recipient_id)
);
create index couple_letters_couple_created_idx on public.couple_letters(couple_id, created_at desc);
alter table public.couples add column love_letter text check (char_length(love_letter) <= 1200);
grant update (love_letter) on public.couples to authenticated;

create table public.voice_capsules (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  category text not null default 'today' check (category in ('today', 'sleep', 'miss', 'blessing')),
  title text not null check (char_length(btrim(title)) between 1 and 80),
  audio_path text not null,
  duration_seconds integer not null check (duration_seconds between 1 and 180),
  created_at timestamptz not null default now()
);
create index voice_capsules_couple_created_idx on public.voice_capsules(couple_id, created_at desc);

do $$
declare
  table_name text;
begin
  foreach table_name in array array['messages', 'memories', 'albums', 'album_photos', 'together_items', 'anniversaries', 'couple_letters', 'voice_capsules']
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on public.%I from public, anon, authenticated', table_name);
    execute format('grant select, delete on public.%I to authenticated', table_name);
    if table_name <> 'couple_letters' then
      execute format('create policy select_member on public.%I for select to authenticated using (public.is_couple_member(couple_id))', table_name);
    end if;
  end loop;
end;
$$;

grant insert (couple_id, sender_id, content, image_path, media_path, media_type, media_poster_path) on public.messages to authenticated;
grant update (read_at) on public.messages to authenticated;
create policy insert_sender on public.messages for insert to authenticated
  with check (public.is_couple_member(couple_id) and sender_id = auth.uid());
create policy read_receipt_recipient on public.messages for update to authenticated
  using (public.is_couple_member(couple_id) and sender_id is distinct from auth.uid())
  with check (public.is_couple_member(couple_id) and sender_id is distinct from auth.uid());
create policy recall_sender on public.messages for delete to authenticated
  using (public.is_couple_member(couple_id) and sender_id = auth.uid());

create function app_private.set_read_receipt()
returns trigger language plpgsql set search_path = ''
as $$
begin
  new.read_at := coalesce(old.read_at, clock_timestamp());
  return new;
end;
$$;
create trigger set_read_receipt before update of read_at on public.messages
  for each row execute function app_private.set_read_receipt();

grant insert (couple_id, author_id, content, memory_date, location, photos) on public.memories to authenticated;
grant update (content, memory_date, location, photos, updated_at) on public.memories to authenticated;
create policy insert_author on public.memories for insert to authenticated
  with check (public.is_couple_member(couple_id) and author_id = auth.uid());
create policy update_author on public.memories for update to authenticated
  using (public.is_couple_member(couple_id) and author_id = auth.uid())
  with check (public.is_couple_member(couple_id) and author_id = auth.uid());
create policy delete_author on public.memories for delete to authenticated
  using (public.is_couple_member(couple_id) and author_id = auth.uid());

grant insert (couple_id, created_by, name, description, cover_path) on public.albums to authenticated;
grant update (name, description, cover_path) on public.albums to authenticated;
create policy insert_creator on public.albums for insert to authenticated
  with check (public.is_couple_member(couple_id) and created_by = auth.uid());
create policy update_creator on public.albums for update to authenticated
  using (public.is_couple_member(couple_id) and created_by = auth.uid())
  with check (public.is_couple_member(couple_id) and created_by = auth.uid());
create policy delete_creator on public.albums for delete to authenticated
  using (public.is_couple_member(couple_id) and created_by = auth.uid());

grant insert (album_id, couple_id, uploaded_by, path, thumb_path, medium_path, original_path, video_poster_path, media_type, caption, taken_date)
  on public.album_photos to authenticated;
grant update (thumb_path, medium_path, original_path, video_poster_path) on public.album_photos to authenticated;
create policy insert_uploader on public.album_photos for insert to authenticated
  with check (public.is_couple_member(couple_id) and uploaded_by = auth.uid());
create policy update_variants_member on public.album_photos for update to authenticated
  using (public.is_couple_member(couple_id)) with check (public.is_couple_member(couple_id));
create policy delete_member on public.album_photos for delete to authenticated
  using (public.is_couple_member(couple_id));

grant insert (couple_id, created_by, title, note, category, priority, planned_date) on public.together_items to authenticated;
grant update (title, note, category, priority, planned_date, completed, completed_by, completed_at) on public.together_items to authenticated;
create policy insert_creator on public.together_items for insert to authenticated
  with check (public.is_couple_member(couple_id) and created_by = auth.uid());
create policy update_member on public.together_items for update to authenticated
  using (public.is_couple_member(couple_id))
  with check (public.is_couple_member(couple_id) and (completed_by is null or exists (
    select 1 from public.couple_members m where m.couple_id = together_items.couple_id and m.user_id = completed_by
  )));
create policy delete_creator on public.together_items for delete to authenticated
  using (public.is_couple_member(couple_id) and created_by = auth.uid());

grant insert (couple_id, created_by, title, event_date, kind, recurring, note) on public.anniversaries to authenticated;
grant update (title, event_date, kind, recurring, note) on public.anniversaries to authenticated;
create policy insert_creator on public.anniversaries for insert to authenticated
  with check (public.is_couple_member(couple_id) and created_by = auth.uid());
create policy update_member on public.anniversaries for update to authenticated
  using (public.is_couple_member(couple_id)) with check (public.is_couple_member(couple_id));
create policy delete_creator on public.anniversaries for delete to authenticated
  using (public.is_couple_member(couple_id) and created_by = auth.uid());

grant insert (couple_id, sender_id, recipient_id, content) on public.couple_letters to authenticated;
create policy select_correspondent on public.couple_letters for select to authenticated
  using (public.is_couple_member(couple_id) and auth.uid() in (sender_id, recipient_id));
create policy insert_sender on public.couple_letters for insert to authenticated
  with check (public.is_couple_member(couple_id) and sender_id = auth.uid() and exists (
    select 1 from public.couple_members m where m.couple_id = couple_letters.couple_id and m.user_id = recipient_id
  ));
create policy delete_sender on public.couple_letters for delete to authenticated
  using (public.is_couple_member(couple_id) and sender_id = auth.uid());

grant insert (couple_id, author_id, category, title, audio_path, duration_seconds) on public.voice_capsules to authenticated;
create policy insert_author on public.voice_capsules for insert to authenticated
  with check (public.is_couple_member(couple_id) and author_id = auth.uid());
create policy delete_author on public.voice_capsules for delete to authenticated
  using (public.is_couple_member(couple_id) and author_id = auth.uid());

revoke all on function app_private.set_photo_couple(), app_private.set_read_receipt()
  from public, anon, authenticated;
