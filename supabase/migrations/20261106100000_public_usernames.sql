create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists profiles_username_ci_unique
  on public.profiles (lower(username));

create or replace function public.ensure_profile_for_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  adjectives text[] := array[
    'Amber', 'Brave', 'Calm', 'Clever', 'Cosmic', 'Crimson', 'Golden', 'Jolly',
    'Lucky', 'Mellow', 'Misty', 'Quiet', 'Rapid', 'Silver', 'Sunny', 'Velvet'
  ];
  nouns text[] := array[
    'Falcon', 'Badger', 'Comet', 'Dervish', 'Fox', 'Heron', 'Jackal', 'Kite',
    'Mango', 'Panda', 'Raven', 'River', 'Tiger', 'Voyager', 'Willow', 'Zebra'
  ];
  candidate text;
  attempt integer;
begin
  if p_user_id is null then
    return;
  end if;

  if exists (select 1 from public.profiles where id = p_user_id) then
    return;
  end if;

  for attempt in 1..100 loop
    candidate := adjectives[1 + floor(random() * array_length(adjectives, 1))::integer]
      || nouns[1 + floor(random() * array_length(nouns, 1))::integer]
      || (100 + floor(random() * 900)::integer)::text;

    begin
      insert into public.profiles (id, username)
      values (p_user_id, candidate);
      return;
    exception when unique_violation then
      if exists (select 1 from public.profiles where id = p_user_id) then
        return;
      end if;
      -- A different account took this handle; generate another candidate.
    end;
  end loop;

  raise exception 'Could not generate a unique public username after % attempts', attempt;
end;
$$;

create or replace function public.handle_new_auth_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.ensure_profile_for_user(new.id);
  return new;
end;
$$;

revoke all on function public.ensure_profile_for_user(uuid) from public, anon, authenticated;
revoke all on function public.handle_new_auth_profile() from public, anon, authenticated;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
after insert on auth.users
for each row execute function public.handle_new_auth_profile();

do $$
declare
  existing_user record;
begin
  for existing_user in select id from auth.users loop
    perform public.ensure_profile_for_user(existing_user.id);
  end loop;
end;
$$;

alter table public.profiles enable row level security;

drop policy if exists "public usernames are readable" on public.profiles;
create policy "public usernames are readable" on public.profiles
for select to anon, authenticated
using (true);

revoke all on public.profiles from public, anon, authenticated;
grant select on public.profiles to anon, authenticated;
