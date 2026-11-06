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
  body text not null,
  likes integer not null default 0,
  created_at timestamptz not null default now(),
  hidden boolean not null default false
);

create table if not exists public.comment_likes (
  comment_id uuid not null references public.comments(id) on delete cascade,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

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

alter table public.polls enable row level security;
alter table public.options enable row level security;
alter table public.votes enable row level security;
alter table public.option_counts enable row level security;
alter table public.comments enable row level security;
alter table public.comment_likes enable row level security;

create policy "polls are visible to everyone" on public.polls
for select using (true);

create policy "options are visible to everyone" on public.options
for select using (true);

create policy "votes are writable anonymously through rpc" on public.votes
for insert with check (true);

create policy "option counts are visible to everyone" on public.option_counts
for select using (true);

create policy "comments are visible to everyone" on public.comments
for select using (not hidden);
