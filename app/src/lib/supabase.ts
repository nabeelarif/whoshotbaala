import { createClient, type User } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      })
    : null

export const demoVoteCounts: Record<string, number> = {
  qadir: 46,
  billo: 23,
  phajja: 40,
  insider: 31,
  alive: 12,
}

export const isSupabaseConfigured = Boolean(supabase)

export type PollStatus = {
  locks_at: string
  is_locked: boolean
  revealed_answer: string | null
  my_vote: string | null
}

export type TheoryRecord = {
  id: string
  user_id: string
  option_key: string
  body: string
  likes: number
  created_at: string
  liked: boolean
}

export async function signInWithGoogle() {
  if (!supabase) throw new Error('Supabase is not configured.')

  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin },
  })

  if (error) throw new Error(error.message)
}

export async function signOut() {
  if (!supabase) throw new Error('Supabase is not configured.')

  const { error } = await supabase.auth.signOut()
  if (error) throw new Error(error.message)
}

export function getAnonymousVoterId() {
  if (typeof window === 'undefined') {
    return 'server-side-voter'
  }

  const storageKey = 'who-shot-baala-voter-id'
  let voterId = localStorage.getItem(storageKey)

  if (!voterId) {
    voterId = crypto.randomUUID()
    localStorage.setItem(storageKey, voterId)
  }

  return voterId
}

export async function submitVote(optionKey: string) {
  const voterId = getAnonymousVoterId()

  if (!supabase) {
    return {
      ok: true,
      mode: 'demo' as const,
      data: {
        option_key: optionKey,
        voter_id: voterId,
      },
    }
  }

  const { data, error } = await supabase.rpc('cast_vote', {
    p_poll_slug: 'who-shot-baala',
    p_option_key: optionKey,
    p_voter_id: voterId,
  })

  if (error) {
    throw new Error(error.message)
  }

  return {
    ok: true,
    mode: 'live' as const,
    data,
  }
}

export async function fetchPollCounts() {
  if (!supabase) {
    return demoVoteCounts
  }

  const { data, error } = await supabase.rpc('get_poll_counts', {
    p_poll_slug: 'who-shot-baala',
  })

  if (error) {
    throw new Error(error.message)
  }

  return Object.fromEntries(
    ((data ?? []) as Array<{ option_key: string; count: number }>).map((item) => [
      item.option_key,
      Number(item.count ?? 0),
    ]),
  ) as Record<string, number>
}

export async function fetchPollStatus(): Promise<PollStatus | null> {
  if (!supabase) {
    return null
  }

  const { data, error } = await supabase.rpc('get_poll_status', {
    p_poll_slug: 'who-shot-baala',
    p_voter_id: getAnonymousVoterId(),
  })

  if (error) {
    throw new Error(error.message)
  }

  return (data as PollStatus | null) ?? null
}

export async function fetchTheories(userId: string | null): Promise<TheoryRecord[]> {
  if (!supabase) return []

  const { data: poll, error: pollError } = await supabase
    .from('polls')
    .select('id')
    .eq('slug', 'who-shot-baala')
    .single()

  if (pollError) throw new Error(pollError.message)

  const { data, error } = await supabase
    .from('comments')
    .select('id, user_id, option_id, body, likes, created_at')
    .eq('poll_id', poll.id)
    .eq('hidden', false)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)

  const rows = (data ?? []) as Array<{
    id: string
    user_id: string
    option_id: string | null
    body: string
    likes: number
    created_at: string
  }>
  const { data: options, error: optionsError } = await supabase
    .from('options')
    .select('id, key')
    .eq('poll_id', poll.id)

  if (optionsError) throw new Error(optionsError.message)
  const optionKeys = new Map((options ?? []).map((option) => [option.id as string, option.key as string]))
  let likedIds = new Set<string>()

  if (userId && rows.length > 0) {
    const { data: likedRows, error: likesError } = await supabase
      .from('comment_likes')
      .select('comment_id')
      .eq('user_id', userId)
      .in('comment_id', rows.map((row) => row.id))

    if (likesError) throw new Error(likesError.message)
    likedIds = new Set((likedRows ?? []).map((row) => row.comment_id as string))
  }

  return rows.map((row) => ({
    id: row.id,
    user_id: row.user_id,
    option_key: row.option_id ? optionKeys.get(row.option_id) ?? 'qadir' : 'qadir',
    body: row.body,
    likes: Number(row.likes ?? 0),
    created_at: row.created_at,
    liked: likedIds.has(row.id),
  }))
}

export async function postTheory(user: User, optionKey: string, body: string) {
  if (!supabase) throw new Error('Supabase is not configured.')

  const trimmedBody = body.trim()
  if (!trimmedBody || trimmedBody.length > 500) {
    throw new Error('A theory must be between 1 and 500 characters.')
  }

  const { data: poll, error: pollError } = await supabase
    .from('polls')
    .select('id')
    .eq('slug', 'who-shot-baala')
    .single()

  if (pollError) throw new Error(pollError.message)

  const { data: option, error: optionError } = await supabase
    .from('options')
    .select('id')
    .eq('poll_id', poll.id)
    .eq('key', optionKey)
    .single()

  if (optionError) throw new Error(optionError.message)

  const { error } = await supabase.from('comments').insert({
    poll_id: poll.id,
    user_id: user.id,
    option_id: option.id,
    body: trimmedBody,
  })

  if (error) throw new Error(error.message)
}

export async function toggleTheoryLike(commentId: string) {
  if (!supabase) throw new Error('Supabase is not configured.')

  const { data, error } = await supabase.rpc('toggle_comment_like', {
    p_comment_id: commentId,
  })

  if (error) throw new Error(error.message)

  return data as { liked: boolean; likes: number }
}
