alter table public.comments
add column if not exists deleted_at timestamptz;

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

  return jsonb_build_object(
    'deleted', true,
    'preserved_replies', v_preserved_replies
  );
end;
$$;

revoke all on function public.delete_own_theory_comment(uuid) from public, anon, authenticated;
grant execute on function public.delete_own_theory_comment(uuid) to authenticated;

revoke update, delete on public.comments from public, anon, authenticated;

revoke update, delete on public.comments from public, anon, authenticated;
