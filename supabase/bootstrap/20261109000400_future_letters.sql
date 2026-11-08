create table public.future_letters (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 120),
  content text not null check (char_length(btrim(content)) between 1 and 10000),
  unlock_at timestamptz not null,
  opened_at timestamptz,
  created_at timestamptz not null default now(),
  check (sender_id <> recipient_id)
);
create index future_letters_couple_unlock_idx on public.future_letters(couple_id, unlock_at);
alter table public.future_letters enable row level security;
revoke all on public.future_letters from public, anon, authenticated;

create function public.create_future_letter(p_recipient_id uuid, p_title text, p_content text, p_unlock_at timestamptz)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  target_couple_id uuid;
  letter_id uuid;
begin
  select own.couple_id into target_couple_id
  from public.couple_members own
  join public.couple_members recipient on recipient.couple_id = own.couple_id
  where own.user_id = actor_id and recipient.user_id = p_recipient_id and recipient.user_id <> actor_id;
  if not found then raise exception '收件人必须是当前情侣空间的另一位成员'; end if;
  if p_unlock_at is null or p_unlock_at <= now() then raise exception '解锁时间必须晚于现在'; end if;
  insert into public.future_letters (couple_id, sender_id, recipient_id, title, content, unlock_at)
  values (target_couple_id, actor_id, p_recipient_id, btrim(p_title), btrim(p_content), p_unlock_at)
  returning id into letter_id;
  return letter_id;
end;
$$;

create function public.get_future_letters()
returns table (
  id uuid, sender_id uuid, recipient_id uuid, title text, content text, unlock_at timestamptz,
  created_at timestamptz, opened_at timestamptz, is_unlocked boolean
)
language sql stable security definer set search_path = ''
as $$
  select f.id, f.sender_id, f.recipient_id, f.title,
    case when f.unlock_at <= now() then f.content end,
    f.unlock_at, f.created_at, f.opened_at, f.unlock_at <= now()
  from public.future_letters f
  where public.is_couple_member(f.couple_id) and auth.uid() in (f.sender_id, f.recipient_id)
  order by f.unlock_at, f.created_at desc;
$$;

create function public.mark_future_letter_opened(p_letter_id uuid)
returns void
language sql security definer set search_path = ''
as $$
  update public.future_letters
  set opened_at = coalesce(opened_at, now())
  where id = p_letter_id and recipient_id = auth.uid() and unlock_at <= now()
    and public.is_couple_member(couple_id);
$$;

create function public.delete_future_letter(p_letter_id uuid)
returns void
language sql security definer set search_path = ''
as $$
  delete from public.future_letters
  where id = p_letter_id and sender_id = auth.uid() and public.is_couple_member(couple_id);
$$;

revoke all on function public.create_future_letter(uuid, text, text, timestamptz), public.get_future_letters(),
  public.mark_future_letter_opened(uuid), public.delete_future_letter(uuid) from public, anon, authenticated;
grant execute on function public.create_future_letter(uuid, text, text, timestamptz), public.get_future_letters(),
  public.mark_future_letter_opened(uuid), public.delete_future_letter(uuid) to authenticated;
