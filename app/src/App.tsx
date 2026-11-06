import { useMemo, useState } from 'react'
import { isSupabaseConfigured, submitVote } from './lib/supabase'
import './App.css'

type Suspect = {
  id: string
  mono: string
  name: string
  role: string
  motive: string
  shortLabel: string
}

type Comment = {
  id: number
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

const initialVotes: Record<string, number> = {
  qadir: 46,
  billo: 23,
  phajja: 40,
  insider: 31,
  alive: 12,
}

const initialComments: Comment[] = [
  {
    id: 1,
    user: 'Sample comment',
    tag: 'qadir',
    text: 'Every time his mother looks at Baala, watch Qadir’s face. That boy is a loaded gun.',
    likes: 12,
    liked: false,
    time: '2h ago',
  },
  {
    id: 2,
    user: 'Sample comment',
    tag: 'phajja',
    text: 'Revenge always comes back in this story. Phajja’s son has the clearest reason of anyone.',
    likes: 8,
    liked: false,
    time: '4h ago',
  },
  {
    id: 3,
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

function App() {
  const [votes, setVotes] = useState<Record<string, number>>(initialVotes)
  const [myVote, setMyVote] = useState<string | null>(null)
  const [filter, setFilter] = useState('all')
  const [draft, setDraft] = useState('')
  const [tag, setTag] = useState('qadir')
  const [comments, setComments] = useState(initialComments)
  const [isSubmittingVote, setIsSubmittingVote] = useState(false)
  const [voteError, setVoteError] = useState<string | null>(null)
  const [voteStatus, setVoteStatus] = useState<string | null>(null)

  const totalVotes = useMemo(
    () => Object.values(votes).reduce((sum, value) => sum + value, 0),
    [votes],
  )

  const visibleComments = useMemo(() => {
    if (filter === 'all') return comments
    return comments.filter((comment) => comment.tag === filter)
  }, [comments, filter])

  const handleVote = async (id: string) => {
    if (myVote === id || isSubmittingVote) return

    setIsSubmittingVote(true)
    setVoteError(null)

    try {
      const result = await submitVote(id)

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
    } catch (error) {
      setVoteError(
        error instanceof Error
          ? error.message
          : 'Something went wrong while submitting your vote. Please try again.',
      )
    } finally {
      setIsSubmittingVote(false)
    }
  }

  const handleLike = (id: number) => {
    setComments((current) =>
      current.map((comment) =>
        comment.id === id
          ? {
              ...comment,
              liked: !comment.liked,
              likes: comment.likes + (comment.liked ? -1 : 1),
            }
          : comment,
      ),
    )
  }

  const handlePostTheory = () => {
    if (!draft.trim()) return

    setComments((current) => [
      {
        id: Date.now(),
        user: 'You',
        tag,
        text: draft.trim(),
        likes: 0,
        liked: false,
        time: 'just now',
      },
      ...current,
    ])
    setDraft('')
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
                    disabled={isSubmittingVote}
                  >
                    {isSelected
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
                    I think <span>{suspectLabels[myVote]}</span> shot Baala.
                  </>
                ) : (
                  'Select your suspect'
                )}
              </p>
              <p className="share-meta">Share it before the episode airs. If you are right, you get the “Called It” badge.</p>
            </div>

            <div className="share-actions">
              <button type="button" className="social-btn whatsapp">WhatsApp</button>
              <button type="button" className="social-btn instagram">Instagram story</button>
              <button type="button" className="social-btn neutral">Post on X</button>
              <button type="button" className="social-btn neutral">Copy link</button>
            </div>
          </div>
        </section>

        <section id="discuss" className="discussion-section container">
          <div className="section-header discussion-header">
            <h2>Theory board</h2>
            <p>Tag your suspect, make your case. Best-liked theory each week gets pinned.</p>
          </div>

          <form className="theory-form" onSubmit={(event) => event.preventDefault()}>
            <label htmlFor="theory">Your theory</label>
            <textarea
              id="theory"
              rows={3}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Remember the scene where..."
            />

            <div className="form-row">
              <div className="select-wrap">
                <label htmlFor="tag">I’m blaming</label>
                <select id="tag" value={tag} onChange={(event) => setTag(event.target.value)}>
                  {suspects.map((suspect) => (
                    <option key={suspect.id} value={suspect.id}>
                      {suspect.shortLabel}
                    </option>
                  ))}
                </select>
              </div>

              <button type="button" className="post-button" onClick={handlePostTheory}>
                Post theory
              </button>
            </div>
          </form>

          <div className="filter-row" role="tablist" aria-label="Filter theories by suspect">
            <button
              type="button"
              className={`filter-pill ${filter === 'all' ? 'active' : ''}`}
              onClick={() => setFilter('all')}
            >
              All · {comments.length}
            </button>

            {suspects.map((suspect) => {
              const count = comments.filter((comment) => comment.tag === suspect.id).length
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
                        onClick={() => handleLike(comment.id)}
                        className={`agree-button ${comment.liked ? 'liked' : ''}`}
                      >
                        Agree {comment.likes}
                      </button>
                      <button type="button" className="reply-button">
                        Reply
                      </button>
                    </div>
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
