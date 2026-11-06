# Who Shot Baala? — fan poll website

Fan-made voting + discussion site for the Pakistani drama **Mitti De Baway**
(Green Entertainment, airs Wed & Thu 8pm PKT). A viral promo clip shows a young
gunman shooting Iqbal "Baala" Channan (Wahaj Ali). Visitors vote on who the
shooter is and discuss theories. Goal: something shareable that can go viral.

Always show: "Fan poll · not affiliated with Green Entertainment". Do not use
clips, stills or actor photos from the show.

## Suspects (poll options)
| id | Name | Motive shown |
|---|---|---|
| qadir | Qadir (Qamar-un-Nissa's son) | Baala getting close to his mother |
| billo | Billo's eldest son | Long feud between the families |
| phajja | Phajja's son | Baala killed his father |
| insider | The insider (servant / munshi / guard) | Trusted, knows every plan |
| alive | Nobody: Baala lives | Writer hinted "Hero bhi kabhi marta hai?" |

## Design
Design mockup (Claude design canvas): https://claude.ai/artifact/E5yBaAa9Ho8RKjVF9na8NM
- Look: dark "mitti" brown #17110D, surfaces #221A14 / #1E1712, lines #3A2D22,
  text #F3E9DC, muted #BFAE9B, accent turmeric #E8A930.
- Fonts: Anton (headlines, uppercase), Inter (body), Noto Nastaliq Urdu
  (Punjabi line: بالے نوں گولی کِنّے ماری؟).
- Sections: header → hero → 5 suspect cards (vote) → "Your verdict" share bar
  (WhatsApp biggest, Instagram story, X, copy link) → theory board (composer with
  suspect tag, filter chips per suspect, agree/upvote, reply) → footer.
- Also a 9:16 shareable story card: "I think QADIR shot Baala. [X]% agree".
- Mobile-first: most traffic arrives from WhatsApp forwards on phones.

## Product decisions
- **Results hidden until the user votes.** Show only the total vote count before
  voting (social proof without bandwagon). Results are the reward for voting.
- **Vote switching allowed** until the poll locks (never a second vote).
- **Poll locks** at a `locks_at` time before the reveal episode; after the reveal,
  correct guessers get a shareable "Called It" badge.
- **No login to vote.** Login (Google first; phone OTP later — SMS costs money)
  only to post theories or keep the "Called It" badge.
- Support Roman Urdu / Urdu in comments. Moderate comments for abuse.

## De-duplication (layered, "good enough" for a fan poll)
1. Random device ID (UUID) in cookie + localStorage; DB unique on (poll_id, voter_id);
   repeat vote = upsert (switch), never insert.
2. Cloudflare Turnstile (invisible) checked server-side on every vote.
3. Browser fingerprint as a soft signal (flag, don't block).
4. Per-IP **rate limits only, never IP blocks** — Pakistani mobile carriers use
   CGNAT, many real users share one IP.
5. Logged-in votes stored as "verified" so a verified-only result can be shown.

## Architecture
- Domain: bought on GoDaddy, nameservers pointed to **Cloudflare** (free DNS/CDN/cache).
- Frontend: static site on **Cloudflare Pages** (static requests free/unlimited).
- Backend: **Supabase** free tier (Postgres + Auth). Upgrade to Pro (~$25/mo) only
  if it goes viral. Free tier watch-outs: 5 GB egress/month, 500 MB DB,
  project pauses after 1 week of inactivity.
- Votes: a Postgres function (RPC) that verifies inputs, upserts the vote and
  updates per-suspect counters.
- Results: cached endpoint refreshed every 5–10s (Cloudflare cache in front),
  so spikes don't hit the DB per page view.
- Why not Cloudflare Workers + D1 alone: free plan caps (100k requests/day,
  100k D1 row writes/day) could break the site on an episode night.

## Draft data model (to refine)
- polls(id, slug, title, locks_at, revealed_answer, created_at)
- options(id, poll_id, key, name, role, motive, sort)
- votes(poll_id, voter_id, option_id, user_id null, fingerprint, ip_hash,
  created_at, updated_at) — PK/unique (poll_id, voter_id)
- option_counts(poll_id, option_id, count) — maintained by the vote RPC
- comments(id, poll_id, user_id, option_id tag, body, likes, created_at, hidden)
- comment_likes(comment_id, user_id) — unique

## Next steps
1. Scaffold the frontend from the design (framework TBD).
2. Supabase schema + RLS + vote RPC.
3. Turnstile verification (Supabase Edge Function or Cloudflare Pages Function).
4. Cached results endpoint.
5. Share card generation (OG image + Instagram story PNG per verdict).
6. Comments with Google login + moderation.
