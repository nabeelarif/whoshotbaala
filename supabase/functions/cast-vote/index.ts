const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
}

const allowedOptionKeys = new Set(['qadir', 'billo', 'phajja', 'insider', 'alive'])

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders })
}

Deno.serve(async (request: Request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed.' }, 405)
  }

  const turnstileSecret = Deno.env.get('TURNSTILE_SECRET_KEY')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!turnstileSecret || !supabaseUrl || !serviceRoleKey) {
    console.error('Missing required cast-vote function secrets.')
    return jsonResponse({ error: 'Vote verification is not configured.' }, 500)
  }

  let payload: { optionKey?: unknown; voterId?: unknown; captchaToken?: unknown }
  try {
    payload = await request.json()
  } catch {
    return jsonResponse({ error: 'Invalid request body.' }, 400)
  }

  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) {
    return jsonResponse({ error: 'Invalid request body.' }, 400)
  }

  const { optionKey, voterId, captchaToken } = payload
  if (
    typeof optionKey !== 'string' ||
    !allowedOptionKeys.has(optionKey) ||
    typeof voterId !== 'string' ||
    voterId.length > 100 ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(voterId) ||
    typeof captchaToken !== 'string' ||
    captchaToken.length === 0 ||
    captchaToken.length > 4096
  ) {
    return jsonResponse({ error: 'Vote details or verification token are invalid.' }, 400)
  }

  try {
    const verificationBody = new URLSearchParams({
      secret: turnstileSecret,
      response: captchaToken,
    })
    const verificationResponse = await fetch(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: verificationBody,
      },
    )

    if (!verificationResponse.ok) {
      console.error('Turnstile siteverify returned an HTTP error.')
      return jsonResponse({ error: 'Could not verify the challenge. Please try again.' }, 502)
    }

    const verification = await verificationResponse.json() as {
      success?: boolean
      action?: string
      hostname?: string
      'error-codes'?: string[]
    }

    const allowedHostnames = (Deno.env.get('TURNSTILE_ALLOWED_HOSTNAMES') ?? '')
      .split(',')
      .map((hostname) => hostname.trim().toLowerCase())
      .filter(Boolean)
    const hostnameAllowed =
      allowedHostnames.length === 0 ||
      (typeof verification.hostname === 'string' &&
        allowedHostnames.includes(verification.hostname.toLowerCase()))

    if (!verification.success || verification.action !== 'vote' || !hostnameAllowed) {
      console.warn('Turnstile verification rejected a vote.', verification['error-codes'] ?? [])
      return jsonResponse({ error: 'Challenge verification failed. Please try again.' }, 403)
    }

    const rpcResponse = await fetch(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/rpc/cast_vote`, {
      method: 'POST',
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        p_poll_slug: 'who-shot-baala',
        p_option_key: optionKey,
        p_voter_id: voterId,
      }),
    })

    const rpcData = await rpcResponse.json().catch(() => null)
    if (!rpcResponse.ok) {
      const message = typeof rpcData?.message === 'string' ? rpcData.message : 'Vote could not be saved.'
      return jsonResponse({ error: message }, rpcResponse.status === 401 ? 500 : 400)
    }

    return jsonResponse({ ok: true, data: rpcData })
  } catch (error) {
    console.error('Vote submission failed.', error)
    return jsonResponse({ error: 'Vote submission failed. Please try again.' }, 502)
  }
})
