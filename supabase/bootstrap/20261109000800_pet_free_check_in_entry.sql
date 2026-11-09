-- The old project exposes a similarly named RPC that initializes a pet.
-- Give clients a distinct read entry point so they never invoke it.
create function public.get_daily_couple_check_in()
returns jsonb
language sql stable security invoker set search_path = ''
as $$
  select public.get_couple_streak_status();
$$;

revoke all on function public.get_daily_couple_check_in() from public, anon, authenticated;
grant execute on function public.get_daily_couple_check_in() to authenticated;
