# Who Shot Baala?

A fan-made voting and discussion site for the Pakistani drama **Mitti De Baway**. A viral promo clip shows a young gunman shooting Iqbal "Baala" Channan; visitors vote on who the shooter is, share their verdict, and post theories.

> Fan poll · not affiliated with Green Entertainment. No clips, stills or actor photos from the show are used.

Product and architecture notes live in [CLAUDE.md](CLAUDE.md). Design mockups are in [design/](design/).

## What it does

**Audience:** Fans of the drama, mostly on phones arriving from WhatsApp forwards.
**Problem:** Give fans a quick, shareable way to commit to a theory and see what others think.

### Implemented

- Poll with five suspects (Qadir, Billo's eldest son, Phajja's son, the insider, "nobody: Baala lives").
- Anonymous voting with a random device ID stored in `localStorage`. Voters can switch their vote until the poll locks.
- Cloudflare Turnstile check on every vote, verified server-side in a Supabase Edge Function.
- Vote counts are maintained per option by a Postgres function (`cast_vote`), which is callable only by the service role.
- Poll lock time and reveal status (`get_poll_status`); the answer is only exposed after the lock time.
- "Your verdict" share bar: WhatsApp, Instagram story, X, Facebook, copy link. A canvas-rendered 9:16 story card ([shareCard.ts](app/src/lib/shareCard.ts)).
- "Called It" state shown once the poll has been revealed and the user's pick matches.
- Google sign-in (Supabase Auth) and public usernames.
- Theory board: post a theory tagged to a suspect, replies, agree/like, delete your own theory.
- Demo mode: without Supabase env vars the app runs with sample vote counts and no backend.
- SEO: prerendered landing page, `robots.txt`, `sitemap.xml`, social preview image; optional Google Analytics events.

### Planned / not implemented

Per [CLAUDE.md](CLAUDE.md), these are intended but not present in the code:

- Phone OTP login.
- Browser fingerprint soft signal and per-IP rate limiting.
- A separate cached results endpoint in front of the database.
- Server-generated OG images per verdict.
- Comment moderation tooling (the `hidden` flag exists in the schema, but no moderation UI).
- Persistent "Called It" badge for logged-in users, and a verified-only results view.
- Automated tests (none exist yet).

## Tech stack

| Area | Technology | Role |
|---|---|---|
| Language | TypeScript (~7.0), SQL, Deno-style TS | App code, database schema/functions, Edge Function |
| UI | React 19 | Single-page UI |
| Build | Vite 8, `@vitejs/plugin-react` | Dev server and bundling |
| Prerender | `scripts/prerender.mjs` (react-dom/server) | Renders the landing page into `dist/index.html` at build |
| Lint | Oxlint | Linting (`npm run lint`) |
| Database | Supabase Postgres | Polls, options, votes, counts, comments, profiles, with RLS |
| Auth | Supabase Auth (Google OAuth) | Sign-in for posting theories |
| Serverless | Supabase Edge Functions | `cast-vote`: Turnstile verification, then the vote RPC |
| Bot protection | Cloudflare Turnstile (`@marsidev/react-turnstile`) | Verifies votes |
| Analytics | Google Analytics (optional) | Share-click events |
| Hosting | Cloudflare Pages + Cloudflare DNS (per project plan) | Static hosting; no deploy config is checked into the repo |
| Testing | None configured | |

## Project structure

```
app/                 Vite + React frontend
  src/App.tsx          Main UI: poll, share bar, theory board
  src/lib/supabase.ts  Supabase client, vote/auth/theory API calls, demo data
  src/lib/shareCard.ts Story card image generation
  scripts/prerender.mjs  Post-build static prerender
  public/              Static assets, robots.txt, sitemap.xml
supabase/            Backend
  schema.sql           Tables, RLS policies, RPC functions, seed data
  migrations/          Incremental SQL migrations
  functions/cast-vote/ Edge Function (Turnstile + vote RPC)
  config.toml          Supabase CLI config
design/              HTML design mockups
CLAUDE.md            Product decisions and architecture notes
```

## Getting started

### Prerequisites

- Node.js and npm (developed with Node 26; no `engines` field is declared)
- For the backend (optional): a Supabase project, the [Supabase CLI](https://supabase.com/docs/guides/cli), a Google OAuth provider configured in Supabase, and a Cloudflare Turnstile site

### Install and run (demo mode)

```bash
cd app
npm install
npm run dev
```

Without any env vars the app runs in demo mode with sample counts and no backend.

### Environment variables

Frontend: copy [app/.env.example](app/.env.example) to `app/.env.local`:

| Variable | Purpose |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon (public) key |
| `VITE_TURNSTILE_SITE_KEY` | Turnstile site key |
| `VITE_GA_MEASUREMENT_ID` | Google Analytics ID (listed in the example file) |

Edge Function: see [supabase/functions/.env.example](supabase/functions/.env.example). Set these as Supabase secrets; never use a `VITE_` prefix for them.

| Variable | Purpose |
|---|---|
| `TURNSTILE_SECRET_KEY` | Turnstile secret key |
| `TURNSTILE_ALLOWED_HOSTNAMES` | Comma-separated hostnames allowed in Turnstile verification |

The function also reads `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, which Supabase provides.

### Backend setup

Apply [supabase/schema.sql](supabase/schema.sql) (and the files in [supabase/migrations/](supabase/migrations/)) to your Supabase project, then deploy the function with the Supabase CLI (`supabase functions deploy cast-vote`). To serve it locally: `supabase functions serve --env-file supabase/functions/.env.local`. These CLI commands were not run as part of writing this README.

### Scripts (run from `app/`)

| Command | Description |
|---|---|
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Type-check (`tsc -b`), build, then prerender the landing page into `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | Run Oxlint |

There is no test script yet.

## License

No license file is included.
