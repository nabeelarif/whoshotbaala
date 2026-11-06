import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      })
    : null

export const isSupabaseConfigured = Boolean(supabase)

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
