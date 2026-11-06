create extension if not exists pgcrypto;

create table if not exists public.polls (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  locks_at timestamptz not null,
  revealed_answer text,
  created_at timestamptz not null default now()
);

create table if not exists public.options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls(id) on delete cascade,
  key text not null,
  name text not null,
  role text,
  motive text,
  sort integer not null default 0,
  unique (poll_id, key)
);

create table if not exists public.votes (
  poll_id uuid not null references public.polls(id) on delete cascade,
  voter_id text not null,
  option_id uuid not null references public.options(id),
  user_id uuid,
  fingerprint text,
  ip_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (poll_id, voter_id)
);

create table if not exists public.option_counts (
  poll_id uuid not null references public.polls(id) on delete cascade,
  option_id uuid not null references public.options(id),
  count integer not null default 0,
  primary key (poll_id, option_id)
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls(id) on delete cascade,
  user_id uuid,
  option_id uuid references public.options(id),
  parent_id uuid references public.comments(id) on delete cascade,
  body text not null,
  likes integer not null default 0,
  created_at timestamptz not null default now(),
  hidden boolean not null default false,
  deleted_at timestamptz
);

alter table public.comments
add column if not exists parent_id uuid references public.comments(id) on delete cascade;

alter table public.comments
add column if not exists deleted_at timestamptz;

create table if not exists public.comment_likes (
  comment_id uuid not null references public.comments(id) on delete cascade,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

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

-- Initial poll setup. Adjust locks_at to the actual voting deadline in Supabase.
insert into public.polls (slug, title, locks_at)
values (
  'who-shot-baala',
  'Who Shot Baala?',
  now() + interval '30 days'
)
on conflict (slug) do nothing;

insert into public.options (poll_id, key, name, role, motive, sort)
select p.id, seed.key, seed.name, seed.role, seed.motive, seed.sort
from public.polls p
cross join (values
  ('qadir', 'Qadir', 'Qamar-un-Nissa''s son', 'Baala getting close to his mother', 1),
  ('billo', 'Billo''s eldest son', 'Long-feuding family', 'Long feud between the families', 2),
  ('phajja', 'Phajja''s son', 'Phajja''s son', 'Baala killed his father', 3),
  ('insider', 'The insider', 'Servant, munshi or guard', 'Trusted and knows every plan', 4),
  ('alive', 'Nobody: Baala lives', 'Plot-twist possibility', 'The writer hinted: Hero bhi kabhi marta hai?', 5)
) as seed(key, name, role, motive, sort)
where p.slug = 'who-shot-baala'
on conflict (poll_id, key) do update
set name = excluded.name,
    role = excluded.role,
    motive = excluded.motive,
    sort = excluded.sort;

create or replace function public.cast_vote(
  p_poll_slug text,
  p_option_key text,
  p_voter_id text
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_poll public.polls;
  v_option public.options;
  v_previous public.votes;
begin
  select * into v_poll
  from public.polls
  where slug = p_poll_slug
  for update;

  if v_poll.id is null then
    raise exception 'Poll not found';
  end if;

  if now() >= v_poll.locks_at then
    raise exception 'Poll is closed';
  end if;

  select * into v_option
  from public.options
  where poll_id = v_poll.id and key = p_option_key;

  if v_option.id is null then
    raise exception 'Option not found';
  end if;

  select * into v_previous
  from public.votes
  where poll_id = v_poll.id and voter_id = p_voter_id
  for update;

  if v_previous.poll_id is not null and v_previous.option_id = v_option.id then
    return json_build_object(
      'status', 'unchanged',
      'poll_slug', p_poll_slug,
      'option_key', p_option_key,
      'voter_id', p_voter_id
    );
  end if;

  if v_previous.poll_id is not null then
    update public.option_counts
    set count = count - 1
    where poll_id = v_poll.id and option_id = v_previous.option_id;
  end if;

  insert into public.votes (poll_id, voter_id, option_id, updated_at)
  values (v_poll.id, p_voter_id, v_option.id, now())
  on conflict (poll_id, voter_id)
  do update set option_id = excluded.option_id, updated_at = excluded.updated_at;

  insert into public.option_counts (poll_id, option_id, count)
  values (v_poll.id, v_option.id, 1)
  on conflict (poll_id, option_id)
  do update set count = public.option_counts.count + 1;

  return json_build_object(
    'status', 'updated',
    'poll_slug', p_poll_slug,
    'option_key', p_option_key,
    'voter_id', p_voter_id
  );
end;
$$;

revoke all on function public.cast_vote(text, text, text) from public, anon, authenticated;
grant execute on function public.cast_vote(text, text, text) to service_role;

create or replace function public.get_poll_counts(p_poll_slug text)
returns table(option_key text, count integer)
language sql
security definer
set search_path = public
as $$
  select o.key as option_key, coalesce(c.count, 0) as count
  from public.options o
  left join public.option_counts c
    on c.option_id = o.id
  left join public.polls p on p.id = o.poll_id
  where p.slug = p_poll_slug
  order by o.sort asc;
$$;

create or replace function public.get_poll_status(
  p_poll_slug text,
  p_voter_id text
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'locks_at', p.locks_at,
    'is_locked', now() >= p.locks_at,
    'revealed_answer', case
      when now() >= p.locks_at then p.revealed_answer
      else null
    end,
    'my_vote', o.key
  )
  from public.polls p
  left join public.votes v
    on v.poll_id = p.id and v.voter_id = p_voter_id
  left join public.options o on o.id = v.option_id
  where p.slug = p_poll_slug;
$$;

revoke all on function public.get_poll_status(text, text) from public;
grant execute on function public.get_poll_status(text, text) to anon, authenticated;

alter table public.polls enable row level security;
alter table public.options enable row level security;
alter table public.votes enable row level security;
alter table public.option_counts enable row level security;
alter table public.comments enable row level security;
alter table public.comment_likes enable row level security;

drop policy if exists "polls are visible to everyone" on public.polls;
create policy "polls are visible to everyone" on public.polls
for select using (true);

drop policy if exists "options are visible to everyone" on public.options;
create policy "options are visible to everyone" on public.options
for select using (true);

drop policy if exists "votes are writable anonymously through rpc" on public.votes;
revoke insert, update, delete on public.votes from public, anon, authenticated;
revoke insert, update, delete on public.option_counts from public, anon, authenticated;

drop policy if exists "option counts are visible to everyone" on public.option_counts;
create policy "option counts are visible to everyone" on public.option_counts
for select using (true);

drop policy if exists "comments are visible to everyone" on public.comments;
create policy "comments are visible to everyone" on public.comments
for select using (not hidden);

drop policy if exists "authenticated users can post theories" on public.comments;
create policy "authenticated users can post theories" on public.comments
for insert to authenticated
with check (
  auth.uid() = user_id
  and option_id is not null
  and char_length(btrim(body)) between 1 and 500
  and exists (
    select 1
    from public.polls p
    where p.id = poll_id and p.slug = 'who-shot-baala'
  )
  and (
    comments.parent_id is null
    or exists (
      select 1
      from public.comments parent
      where parent.id = comments.parent_id
        and parent.parent_id is null
        and parent.poll_id = comments.poll_id
        and parent.option_id = comments.option_id
        and parent.deleted_at is null
    )
  )
);

drop policy if exists "users can read their own theory likes" on public.comment_likes;
create policy "users can read their own theory likes" on public.comment_likes
for select to authenticated
using (user_id = auth.uid());

create or replace function public.toggle_comment_like(p_comment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_is_liked boolean;
  v_likes integer;
begin
  if v_user_id is null then
    raise exception 'Sign in is required to like a theory';
  end if;

  perform 1
  from public.comments
  where id = p_comment_id and hidden = false and deleted_at is null
  for update;

  if not found then
    raise exception 'Theory not found';
  end if;

  select exists (
    select 1
    from public.comment_likes
    where comment_id = p_comment_id and user_id = v_user_id
  ) into v_is_liked;

  if v_is_liked then
    delete from public.comment_likes
    where comment_id = p_comment_id and user_id = v_user_id;

    update public.comments
    set likes = greatest(likes - 1, 0)
    where id = p_comment_id
    returning likes into v_likes;

    v_is_liked := false;
  else
    insert into public.comment_likes (comment_id, user_id)
    values (p_comment_id, v_user_id);

    update public.comments
    set likes = likes + 1
    where id = p_comment_id
    returning likes into v_likes;

    v_is_liked := true;
  end if;

  return jsonb_build_object('liked', v_is_liked, 'likes', v_likes);
end;
$$;

revoke all on function public.toggle_comment_like(uuid) from public;
grant execute on function public.toggle_comment_like(uuid) to authenticated;

create or replace function public.delete_own_theory_comment(p_comment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_comment public.comments;
  v_preserved_replies boolean;
begin
  if v_user_id is null then
    raise exception 'Sign in is required to delete a theory or reply';
  end if;

  select * into v_comment
  from public.comments
  where id = p_comment_id
  for update;

  if not found or v_comment.user_id is distinct from v_user_id then
    raise exception 'You can only delete your own theory or reply';
  end if;

  if v_comment.deleted_at is not null then
    raise exception 'This theory or reply has already been deleted';
  end if;

  select exists (
    select 1 from public.comments where parent_id = p_comment_id
  ) into v_preserved_replies;

  if v_preserved_replies then
    update public.comments
    set body = '[deleted]', user_id = null, deleted_at = now(), likes = 0
    where id = p_comment_id;

    delete from public.comment_likes where comment_id = p_comment_id;
  else
    delete from public.comments where id = p_comment_id;
  end if;

  return jsonb_build_object('deleted', true, 'preserved_replies', v_preserved_replies);
end;
$$;

revoke all on function public.delete_own_theory_comment(uuid) from public, anon, authenticated;
grant execute on function public.delete_own_theory_comment(uuid) to authenticated;

grant usage on schema public to anon, authenticated;
grant select on public.polls, public.options, public.option_counts, public.comments to anon, authenticated;
grant insert on public.comments to authenticated;
grant select on public.comment_likes to authenticated;
revoke update, delete on public.comments from public, anon, authenticated;
