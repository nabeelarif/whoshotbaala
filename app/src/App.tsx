import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile'
import {
  demoVoteCounts,
  fetchPollCounts,
  fetchPollStatus,
  fetchTheories,
  isSupabaseConfigured,
  postTheory,
  postTheoryReply,
  signInWithGoogle,
  signOut,
  submitVote,
  supabase,
  toggleTheoryLike,
  type PollStatus,
  type TheoryRecord,
} from './lib/supabase'
import { createVerdictStoryCard } from './lib/shareCard'
import type { User } from '@supabase/supabase-js'
import './App.css'

const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY

type Suspect = {
  id: string
  mono: string
  name: string
  role: string
  motive: string
  shortLabel: string
}

type Comment = {
  id: string
  userId: string
  parentId: string | null
  user: string
  tag: string
  text: string
  likes: number
  liked: boolean
  time: string
}

const suspects: Suspect[] = [
  {
    id: 'qadir',
    mono: 'Q',
    name: 'Qadir',
    role: "Qamar-un-Nissa's son",
    motive: 'Baala is getting close to his mother, and he does not like it.',
    shortLabel: 'Qadir',
  },
  {
    id: 'billo',
    mono: 'B',
    name: "Billo's eldest son",
    role: 'Heir to the feud',
    motive: 'Years of bad blood between the two families.',
    shortLabel: "Billo's son",
  },
  {
    id: 'phajja',
    mono: 'P',
    name: "Phajja's son",
    role: 'A son with a score',
    motive: 'Baala killed his father.',
    shortLabel: "Phajja's son",
  },
  {
    id: 'insider',
    mono: 'I',
    name: 'The insider',
    role: 'Servant, munshi or guard',
    motive: 'Someone trusted, close enough to know every plan.',
    shortLabel: 'The insider',
  },
  {
    id: 'alive',
    mono: '?',
    name: 'Nobody: Baala lives',
    role: 'Plot-twist camp',
    motive: '"Hero bhi kabhi marta hai?" The writer keeps hinting at more.',
    shortLabel: 'Baala lives',
  },
]

const initialVotes: Record<string, number> = demoVoteCounts

const initialComments: Comment[] = [
  {
    id: 'demo-1',
    userId: '',
    parentId: null,
    user: 'Sample comment',
    tag: 'qadir',
    text: 'Every time his mother looks at Baala, watch Qadir’s face. That boy is a loaded gun.',
    likes: 12,
    liked: false,
    time: '2h ago',
  },
  {
    id: 'demo-2',
    userId: '',
    parentId: null,
    user: 'Sample comment',
    tag: 'phajja',
    text: 'Revenge always comes back in this story. Phajja’s son has the clearest reason of anyone.',
    likes: 8,
    liked: false,
    time: '4h ago',
  },
  {
    id: 'demo-3',
    userId: '',
    parentId: null,
    user: 'Sample comment',
    tag: 'alive',
    text: 'Faiza Iftikhar would not kill the hero off in a promo. It’s a fake-out.',
    likes: 15,
    liked: true,
    time: '6h ago',
  },
]

const suspectLabels: Record<string, string> = {
  qadir: 'Qadir',
  billo: "Billo's son",
  phajja: "Phajja's son",
  insider: 'the insider',
  alive: 'nobody',
}

function formatRelativeTime(value: string) {
  const elapsedMinutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000))
  if (elapsedMinutes < 1) return 'just now'
  if (elapsedMinutes < 60) return `${elapsedMinutes}m ago`

  const elapsedHours = Math.floor(elapsedMinutes / 60)
  if (elapsedHours < 24) return `${elapsedHours}h ago`

  const elapsedDays = Math.floor(elapsedHours / 24)
  return `${elapsedDays}d ago`
}

function App() {
  const [votes, setVotes] = useState<Record<string, number>>(initialVotes)
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
  const turnstileRef = useRef<TurnstileInstance | null>(null)
  const [myVote, setMyVote] = useState<string | null>(null)
  const [filter, setFilter] = useState('all')
  const [draft, setDraft] = useState('')
  const [tag, setTag] = useState('qadir')
  const [comments, setComments] = useState<Comment[]>(isSupabaseConfigured ? [] : initialComments)
  const [isSubmittingVote, setIsSubmittingVote] = useState(false)
  const [voteError, setVoteError] = useState<string | null>(null)
  const [voteStatus, setVoteStatus] = useState<string | null>(null)
  const [hasLiveCounts, setHasLiveCounts] = useState(false)
  const [pollStatus, setPollStatus] = useState<PollStatus | null>(null)
  const [pollStatusError, setPollStatusError] = useState<string | null>(null)
  const [isLoadingPollStatus, setIsLoadingPollStatus] = useState(isSupabaseConfigured)
  const [shareStatus, setShareStatus] = useState<string | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [isAuthLoading, setIsAuthLoading] = useState(isSupabaseConfigured)
  const [authError, setAuthError] = useState<string | null>(null)
  const [theoryError, setTheoryError] = useState<string | null>(null)
  const [isPostingTheory, setIsPostingTheory] = useState(false)
  const [likingTheoryId, setLikingTheoryId] = useState<string | null>(null)
  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const [replyDraft, setReplyDraft] = useState('')
  const [isPostingReply, setIsPostingReply] = useState(false)

  useEffect(() => {
    if (!supabase) return

    let isMounted = true
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!isMounted) return
      if (error) setAuthError(error.message)
      setUser(data.session?.user ?? null)
      setIsAuthLoading(false)
    })

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
      setIsAuthLoading(false)
      setAuthError(null)
    })

    return () => {
      isMounted = false
      authListener.subscription.unsubscribe()
    }
  }, [])

  const refreshPollCounts = useCallback(async () => {
    try {
      const nextCounts = await fetchPollCounts()
      setVotes({
        qadir: nextCounts.qadir ?? 0,
        billo: nextCounts.billo ?? 0,
        phajja: nextCounts.phajja ?? 0,
        insider: nextCounts.insider ?? 0,
        alive: nextCounts.alive ?? 0,
      })
      setHasLiveCounts(isSupabaseConfigured)
    } catch (error) {
      setHasLiveCounts(false)
      setVoteError(
        error instanceof Error
          ? error.message
          : 'Unable to load poll results right now.',
      )
    }
  }, [])

  const refreshPollStatus = useCallback(async () => {
    if (!isSupabaseConfigured) return

    try {
      const nextStatus = await fetchPollStatus()
      setPollStatus(nextStatus)
      setMyVote(nextStatus?.my_vote ?? null)
      setPollStatusError(
        nextStatus ? null : 'The poll has not been created in Supabase yet.',
      )
    } catch (error) {
      setPollStatusError(
        error instanceof Error
          ? error.message
          : 'Unable to load poll lock and reveal status.',
      )
    } finally {
      setIsLoadingPollStatus(false)
    }
  }, [])

  useEffect(() => {
    const initialRefresh = window.setTimeout(() => {
      void refreshPollCounts()
      void refreshPollStatus()
    }, 0)
    const refreshInterval = window.setInterval(() => {
      void refreshPollCounts()
      void refreshPollStatus()
    }, 10_000)

    return () => {
      window.clearTimeout(initialRefresh)
      window.clearInterval(refreshInterval)
    }
  }, [refreshPollCounts, refreshPollStatus])

  const totalVotes = useMemo(
    () => Object.values(votes).reduce((sum, value) => sum + value, 0),
    [votes],
  )
  const agreementPercent = myVote && hasLiveCounts && totalVotes > 0
    ? Math.round(((votes[myVote] ?? 0) / totalVotes) * 100)
    : null
  const hasCalledIt = Boolean(
    pollStatus?.is_locked &&
      pollStatus.revealed_answer &&
      myVote &&
      pollStatus.revealed_answer === myVote,
  )

  const calledItStatus = !isSupabaseConfigured
    ? 'Connect Supabase to verify the reveal and award the Called It badge.'
    : pollStatusError
      ? pollStatusError
      : !pollStatus
        ? 'Poll status is not available yet.'
        : !pollStatus.is_locked
          ? 'Your pick is saved. The Called It badge becomes available after voting locks and the answer is revealed.'
          : !pollStatus.revealed_answer
            ? 'The poll is locked. The reveal answer has not been added to Supabase yet.'
            : hasCalledIt
              ? 'You called it! Your saved pick matches the revealed answer.'
              : myVote
                ? `The reveal was ${suspectLabels[pollStatus.revealed_answer] ?? pollStatus.revealed_answer}. Your pick was different.`
                : `The reveal was ${suspectLabels[pollStatus.revealed_answer] ?? pollStatus.revealed_answer}. No saved vote was found for this browser.`

  const shareUrl = () => window.location.href.split('#')[0]
  const shareMessage = () => {
    if (!myVote) return 'Who Shot Baala? Cast your vote.'
    const verdict = hasCalledIt ? 'I CALLED IT!' : `I think ${suspectLabels[myVote]} shot Baala.`
    const agreement = agreementPercent === null
      ? ''
      : ` ${agreementPercent}% of fans agree (${totalVotes.toLocaleString()} votes).`
    return `${verdict}${agreement} Vote in the fan poll: ${shareUrl()}`
  }

  const handleWhatsAppShare = () => {
    window.open(
      `https://wa.me/?text=${encodeURIComponent(shareMessage())}`,
      '_blank',
      'noopener,noreferrer',
    )
  }

  const handleXShare = () => {
    window.open(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareMessage())}`,
      '_blank',
      'noopener,noreferrer',
    )
  }

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl())
      setShareStatus('Poll link copied.')
    } catch {
      setShareStatus('Could not access the clipboard. Copy the page URL from your browser.')
    }
  }

  const handleInstagramStory = async () => {
    if (!myVote) return

    try {
      const file = await createVerdictStoryCard({
        verdict: suspectLabels[myVote],
        agreementPercent,
        totalVotes,
        calledIt: hasCalledIt,
        shareUrl: shareUrl(),
      })

      if (
        typeof navigator.share === 'function' &&
        typeof navigator.canShare === 'function' &&
        navigator.canShare({ files: [file] })
      ) {
        await navigator.share({
          files: [file],
          title: 'My Who Shot Baala verdict',
          text: shareMessage(),
        })
        setShareStatus('Share card ready to post to your story.')
        return
      }

      const fileUrl = URL.createObjectURL(file)
      const downloadLink = document.createElement('a')
      downloadLink.href = fileUrl
      downloadLink.download = file.name
      downloadLink.click()
      window.setTimeout(() => URL.revokeObjectURL(fileUrl), 1000)
      setShareStatus('Story card downloaded. Open Instagram and add it to your story.')
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return
      setShareStatus(
        error instanceof Error ? error.message : 'Could not create the story card.',
      )
    }
  }

  const visibleComments = useMemo(() => {
    const theories = comments.filter((comment) => comment.parentId === null)
    if (filter === 'all') return theories
    return theories.filter((comment) => comment.tag === filter)
  }, [comments, filter])

  const refreshTheories = useCallback(async () => {
    if (!isSupabaseConfigured) return

    try {
      const records = await fetchTheories(user?.id ?? null)
      setComments(records.map((record: TheoryRecord) => ({
        id: record.id,
        userId: record.user_id,
        parentId: record.parent_id,
        user: record.user_id === user?.id ? 'You' : 'Fan',
        tag: record.option_key,
        text: record.body,
        likes: record.likes,
        liked: record.liked,
        time: formatRelativeTime(record.created_at),
      })))
      setTheoryError(null)
    } catch (error) {
      setTheoryError(error instanceof Error ? error.message : 'Unable to load theories.')
    }
  }, [user])

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void refreshTheories(), 0)
    return () => window.clearTimeout(initialLoad)
  }, [refreshTheories])

  const handleVote = async (id: string) => {
    if (myVote === id || isSubmittingVote) return
    if (isSupabaseConfigured && !turnstileToken) {
      setVoteError('Complete the Turnstile verification before voting.')
      return
    }

    setIsSubmittingVote(true)
    setVoteError(null)

    try {
      const result = await submitVote(id, turnstileToken ?? undefined)

      setVotes((current) => {
        const next = { ...current }

        if (myVote) {
          next[myVote] = Math.max(0, next[myVote] - 1)
        }

        next[id] = (next[id] ?? 0) + 1
        return next
      })

      setMyVote(id)
      setTag(id)
      setVoteStatus(
        isSupabaseConfigured && result.mode === 'live'
          ? 'Vote saved to Supabase.'
          : 'Supabase is not configured yet; this vote is running in demo mode.',
      )

      await refreshPollCounts()
      await refreshPollStatus()
    } catch (error) {
      setVoteError(
        error instanceof Error
          ? error.message
          : 'Something went wrong while submitting your vote. Please try again.',
      )
    } finally {
      setTurnstileToken(null)
      turnstileRef.current?.reset()
      setIsSubmittingVote(false)
    }
  }

  const handleSignIn = async () => {
    setAuthError(null)
    try {
      await signInWithGoogle()
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Unable to start Google sign-in.')
    }
  }

  const handleSignOut = async () => {
    setAuthError(null)
    try {
      await signOut()
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'Unable to sign out.')
    }
  }

  const handleLike = async (id: string) => {
    if (!user || likingTheoryId) return

    setLikingTheoryId(id)
    setTheoryError(null)
    try {
      const result = await toggleTheoryLike(id)
      setComments((current) => current.map((comment) => comment.id === id
        ? { ...comment, liked: result.liked, likes: Number(result.likes) }
        : comment))
    } catch (error) {
      setTheoryError(error instanceof Error ? error.message : 'Unable to update this like.')
    } finally {
      setLikingTheoryId(null)
    }
  }

  const handlePostTheory = async () => {
    if (!user || isPostingTheory) return
    if (!draft.trim()) {
      setTheoryError('Write a theory before posting.')
      return
    }

    setIsPostingTheory(true)
    setTheoryError(null)
    try {
      await postTheory(user, tag, draft)
      setDraft('')
      await refreshTheories()
    } catch (error) {
      setTheoryError(error instanceof Error ? error.message : 'Unable to post your theory.')
    } finally {
      setIsPostingTheory(false)
    }
  }

  const handlePostReply = async (parentId: string) => {
    if (!user || isPostingReply) return
    if (!replyDraft.trim()) {
      setTheoryError('Write a reply before posting.')
      return
    }

    setIsPostingReply(true)
    setTheoryError(null)
    try {
      await postTheoryReply(user, parentId, replyDraft)
      setReplyDraft('')
      setReplyingTo(null)
      await refreshTheories()
    } catch (error) {
      setTheoryError(error instanceof Error ? error.message : 'Unable to post your reply.')
    } finally {
      setIsPostingReply(false)
    }
  }

  return (
    <div className="page-shell">
      <header className="topbar">
        <div className="topbar-inner container">
          <div className="brand-block">
            <span className="brand-mark" aria-hidden="true">
              ⏺
            </span>
            <span className="brand-word">Who Shot Baala?</span>
          </div>

          <nav className="main-nav" aria-label="Main navigation">
            <a href="#vote">Vote</a>
            <a href="#discuss">Theories</a>
            <a href="#share">Share</a>
          </nav>

          <span className="small-note">Fan poll · not affiliated with Green Entertainment</span>
        </div>
      </header>

      <main>
        <section className="hero-section container">
          <div className="pill-row">
            <span className="pill pill-soft">Spoiler zone: based on the viral promo clip</span>
            <span className="pill pill-accent">Votes lock before the reveal episode</span>
          </div>

          <h1>
            Who pulled
            <br />
            the trigger?
          </h1>

          <p className="urdu-line" dir="rtl" lang="pa">
            بالے نوں گولی کِنّے ماری؟
          </p>

          <p className="lede">
            The promo shows a young gunman taking aim at Iqbal “Baala” Channan. Pick your suspect,
            defend your theory, and see if you called it when the truth airs.
          </p>
        </section>

        <section id="vote" className="suspects-section container">
          <div className="section-header">
            <h2>The suspects</h2>
            <span>{totalVotes} total votes</span>
          </div>

          {voteStatus && <p className="vote-status">{voteStatus}</p>}
          {voteError && <p className="vote-error">{voteError}</p>}
          {isSupabaseConfigured && turnstileSiteKey ? (
            <div className="turnstile-wrap">
              <p>Verify to cast your vote</p>
              <Turnstile
                ref={turnstileRef}
                siteKey={turnstileSiteKey}
                onSuccess={(token) => {
                  setTurnstileToken(token)
                  setVoteError(null)
                }}
                onExpire={() => setTurnstileToken(null)}
                onError={() => {
                  setTurnstileToken(null)
                  setVoteError('Turnstile could not load. Check the site key and allowed domain.')
                }}
                options={{ action: 'vote', theme: 'dark' }}
              />
            </div>
          ) : isSupabaseConfigured ? (
            <p className="vote-error">
              Voting is unavailable until VITE_TURNSTILE_SITE_KEY is configured.
            </p>
          ) : null}

          <div className="suspects-grid">
            {suspects.map((suspect, index) => {
              const count = votes[suspect.id]
              const pct = totalVotes ? Math.round((count / totalVotes) * 100) : 0
              const isSelected = myVote === suspect.id

              return (
                <article
                  key={suspect.id}
                  className={`suspect-card ${isSelected ? 'selected' : ''}`}
                >
                  <div className="card-head">
                    <span className="mono-badge">{suspect.mono}</span>
                    <span className="card-index">#{index + 1}</span>
                  </div>

                  <div className="card-main-copy">
                    <h3>{suspect.name}</h3>
                    <p className="role">{suspect.role}</p>
                  </div>

                  <p className="motive">
                    <strong>Motive:</strong> {suspect.motive}
                  </p>

                  {myVote !== null && (
                    <div className="vote-meter">
                      <div className="meter-head">
                        <span>{pct}%</span>
                        <span>{count} votes</span>
                      </div>
                      <div className="meter-track">
                        <span style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )}

                  <button
                    type="button"
                    className="vote-button"
                    onClick={() => void handleVote(suspect.id)}
                    disabled={
                      isSubmittingVote ||
                      Boolean(pollStatus?.is_locked) ||
                      (isSupabaseConfigured && (!turnstileSiteKey || !turnstileToken))
                    }
                  >
                    {pollStatus?.is_locked
                      ? 'Poll locked'
                      : isSelected
                      ? 'Your pick'
                      : myVote
                        ? isSubmittingVote
                          ? 'Saving...'
                          : 'Switch vote'
                        : isSubmittingVote
                          ? 'Saving...'
                          : 'Vote'}
                  </button>
                </article>
              )
            })}
          </div>
        </section>

        <section id="share" className="share-section">
          <div className="share-inner container">
            <div className="share-copy">
              <span className="label">Your verdict</span>
              <p className="verdict">
                {myVote ? (
                  <>
                    {hasCalledIt ? 'Called it: ' : 'I think '}
                    <span>{suspectLabels[myVote]}</span> shot Baala.
                  </>
                ) : (
                  'Select your suspect'
                )}
              </p>
              <p className="share-meta">
                {agreementPercent === null
                  ? 'Live fan agreement will appear when Supabase results are connected.'
                  : `${agreementPercent}% of fans agree · ${totalVotes.toLocaleString()} live votes`}
              </p>

              <div className="story-card-preview" aria-label="Live verdict story-card preview">
                <span>{hasCalledIt ? 'Called It' : 'My verdict'}</span>
                <strong>
                  {myVote
                    ? `${hasCalledIt ? 'I CALLED IT: ' : 'I THINK '}${suspectLabels[myVote].toUpperCase()} SHOT BAALA.`
                    : 'YOUR VERDICT WILL APPEAR HERE'}
                </strong>
                <small>
                  {agreementPercent === null
                    ? 'Live vote agreement pending'
                    : `${agreementPercent}% of fans agree · ${totalVotes.toLocaleString()} votes`}
                </small>
              </div>

              <p className="called-it-status" role="status" aria-live="polite">
                {isLoadingPollStatus ? 'Checking poll lock and reveal…' : calledItStatus}
              </p>
            </div>

            <div className="share-actions">
              <button
                type="button"
                className="social-btn whatsapp"
                onClick={handleWhatsAppShare}
                disabled={!myVote}
              >
                WhatsApp
              </button>
              <button
                type="button"
                className="social-btn instagram"
                onClick={() => void handleInstagramStory()}
                disabled={!myVote}
              >
                Instagram story
              </button>
              <button
                type="button"
                className="social-btn neutral"
                onClick={handleXShare}
                disabled={!myVote}
              >
                Post on X
              </button>
              <button
                type="button"
                className="social-btn neutral"
                onClick={() => void handleCopyLink()}
                disabled={!myVote}
              >
                Copy link
              </button>
              {shareStatus && <p className="share-status" role="status">{shareStatus}</p>}
            </div>
          </div>
        </section>

        <section id="discuss" className="discussion-section container">
          <div className="section-header discussion-header">
            <h2>Theory board</h2>
            <p>Tag your suspect, make your case. Best-liked theory each week gets pinned.</p>
          </div>

          <div className="theory-auth">
            {user ? (
              <>
                <p>
                  Signed in as{' '}
                  <strong>
                    {String(user.user_metadata.full_name ?? user.user_metadata.name ?? user.email ?? 'community member')}
                  </strong>
                </p>
                <button type="button" className="auth-button" onClick={() => void handleSignOut()}>
                  Sign out
                </button>
              </>
            ) : (
              <>
                <p>Sign in is required to post a theory or agree with one.</p>
                <button
                  type="button"
                  className="auth-button"
                  onClick={() => void handleSignIn()}
                  disabled={!isSupabaseConfigured || isAuthLoading}
                >
                  {isAuthLoading ? 'Checking sign-in…' : 'Continue with Google'}
                </button>
              </>
            )}
          </div>
          {!isSupabaseConfigured && (
            <p className="theory-notice">Configure Supabase to enable account sign-in and live theories.</p>
          )}
          {authError && <p className="theory-error" role="alert">{authError}</p>}
          {theoryError && <p className="theory-error" role="alert">{theoryError}</p>}

          <form
            className="theory-form"
            onSubmit={(event) => {
              event.preventDefault()
              void handlePostTheory()
            }}
          >
            <label htmlFor="theory">Your theory</label>
            <textarea
              id="theory"
              rows={3}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Remember the scene where..."
              maxLength={500}
              disabled={!user || isPostingTheory}
            />
            <span className="character-count">{draft.length}/500</span>

            <div className="form-row">
              <div className="select-wrap">
                <label htmlFor="theory-tag">I’m blaming</label>
                <select
                  id="theory-tag"
                  value={tag}
                  onChange={(event) => setTag(event.target.value)}
                  disabled={!user || isPostingTheory}
                >
                  {suspects.map((suspect) => (
                    <option key={suspect.id} value={suspect.id}>
                      {suspect.shortLabel}
                    </option>
                  ))}
                </select>
              </div>

              <button type="submit" className="post-button" disabled={!user || isPostingTheory}>
                {isPostingTheory ? 'Posting…' : 'Post theory'}
              </button>
            </div>
          </form>

          <div className="filter-row" role="tablist" aria-label="Filter theories by suspect">
            <button
              type="button"
              className={`filter-pill ${filter === 'all' ? 'active' : ''}`}
              onClick={() => setFilter('all')}
            >
              All · {comments.filter((comment) => comment.parentId === null).length}
            </button>

            {suspects.map((suspect) => {
              const count = comments.filter(
                (comment) => comment.parentId === null && comment.tag === suspect.id,
              ).length
              return (
                <button
                  key={suspect.id}
                  type="button"
                  className={`filter-pill ${filter === suspect.id ? 'active' : ''}`}
                  onClick={() => setFilter(suspect.id)}
                >
                  {suspect.shortLabel} · {count}
                </button>
              )
            })}
          </div>

          <div className="comment-list">
            {visibleComments.length > 0 ? (
              visibleComments.map((comment) => (
                <article key={comment.id} className="comment-card">
                  <span className="comment-avatar" aria-hidden="true">
                    {comment.user.charAt(0).toUpperCase()}
                  </span>

                  <div className="comment-body">
                    <div className="comment-meta">
                      <strong>{comment.user}</strong>
                      <span className="tag-badge">blames {suspectLabels[comment.tag]}</span>
                      <span className="time">{comment.time}</span>
                    </div>

                    <p>{comment.text}</p>

                    <div className="comment-actions">
                      <button
                        type="button"
                        onClick={() => void handleLike(comment.id)}
                        className={`agree-button ${comment.liked ? 'liked' : ''}`}
                        disabled={!user || likingTheoryId !== null}
                      >
                        {likingTheoryId === comment.id ? 'Saving…' : `Agree ${comment.likes}`}
                      </button>
                      <button
                        type="button"
                        className="reply-button"
                        aria-expanded={replyingTo === comment.id}
                        onClick={() => {
                          setReplyingTo((current) => current === comment.id ? null : comment.id)
                          setReplyDraft('')
                          setTheoryError(null)
                        }}
                      >
                        Reply ({comments.filter((reply) => reply.parentId === comment.id).length})
                      </button>
                    </div>

                    {comments
                      .filter((reply) => reply.parentId === comment.id)
                      .map((reply) => (
                        <article key={reply.id} className="theory-reply">
                          <span className="comment-avatar" aria-hidden="true">
                            {reply.user.charAt(0).toUpperCase()}
                          </span>
                          <div className="comment-body">
                            <div className="comment-meta">
                              <strong>{reply.user}</strong>
                              <span className="time">{reply.time}</span>
                            </div>
                            <p>{reply.text}</p>
                            <button
                              type="button"
                              onClick={() => void handleLike(reply.id)}
                              className={`agree-button ${reply.liked ? 'liked' : ''}`}
                              disabled={!user || likingTheoryId !== null}
                            >
                              {likingTheoryId === reply.id ? 'Saving…' : `Agree ${reply.likes}`}
                            </button>
                          </div>
                        </article>
                      ))}

                    {replyingTo === comment.id && (
                      <form
                        className="reply-composer"
                        onSubmit={(event) => {
                          event.preventDefault()
                          void handlePostReply(comment.id)
                        }}
                      >
                        {user ? (
                          <>
                            <label htmlFor={`reply-${comment.id}`}>Your reply</label>
                            <textarea
                              id={`reply-${comment.id}`}
                              rows={2}
                              value={replyDraft}
                              onChange={(event) => setReplyDraft(event.target.value)}
                              maxLength={500}
                              placeholder="Add to the discussion…"
                              disabled={isPostingReply}
                            />
                            <div className="reply-composer-actions">
                              <span>{replyDraft.length}/500</span>
                              <button
                                type="submit"
                                className="post-button"
                                disabled={isPostingReply || !replyDraft.trim()}
                              >
                                {isPostingReply ? 'Replying…' : 'Post reply'}
                              </button>
                            </div>
                          </>
                        ) : (
                          <>
                            <p>Sign in with Google to reply to this theory.</p>
                            <button
                              type="button"
                              className="auth-button"
                              onClick={() => void handleSignIn()}
                              disabled={!isSupabaseConfigured || isAuthLoading}
                            >
                              Continue with Google
                            </button>
                          </>
                        )}
                      </form>
                    )}
                  </div>
                </article>
              ))
            ) : (
              <p className="empty-state">No theories for this suspect yet. Be the first.</p>
            )}
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="container footer-inner">
          <span>A fan-made poll about the drama Mitti De Baway. Not affiliated with Green Entertainment or the show’s makers.</span>
          <span>[YOUR DOMAIN]</span>
        </div>
      </footer>
    </div>
  )
}

export default App
