# Plenova Pinterest Engine

Standalone Pinterest content generation and publishing engine for Plenova.

Pick a plant and a content angle; Gemini writes the Pin copy and paints a 2:3
visual matched to that angle. Review, edit, queue and publish — every Pin points
at the Plenova AppsFlyer OneLink.

This tool is **independent from Plenova's application database**. It has its own
storage and its own catalog.

---

## Quick start

```bash
npm install
```

Create `.env.local` from the template:

```bash
cp .env.example .env.local
```

Set at minimum `GEMINI_API_KEY` (from [Google AI Studio](https://aistudio.google.com/apikey)),
then:

```bash
npm run dev
```

Open http://localhost:3000. The dashboard reports exactly which capabilities are
armed and which are missing.

---

## What works without which credentials

The engine degrades feature-by-feature rather than refusing to start.

| Capability | Requires | Without it |
| --- | --- | --- |
| Browse catalog, angles, dashboard | nothing | works |
| Generate copy + image | `GEMINI_API_KEY` | Generate button disabled |
| Persist Pins locally | nothing | `.data/state.json` is used in dev |
| Persist Pins in production | Vercel Blob store | in-memory, loudly warned |
| Public image URLs | Vercel Blob store | images stay inline, not publishable |
| Connect Pinterest | app id/secret + redirect URI | Pinterest tab explains what's missing |
| Store OAuth tokens | `TOKEN_ENCRYPTION_KEY` | connection is refused rather than stored in clear |
| Publish / scheduled worker | connected account + Blob + `CRON_SECRET` | queue still accepts Pins |

---

## Environment variables

See `.env.example` for the full annotated list. Generate the encryption key with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

No secret is ever exposed to the browser: there is no `NEXT_PUBLIC_*` variable
other than the app URL, and every Gemini/Pinterest call happens in a route
handler or server component.

---

## Languages (FR / EN)

Two independent language settings:

- **Dashboard language** — a cookie-backed switcher in the sidebar. Every page,
  label, plant name and angle name is translated.
- **Pin language** — chosen per generation in the Generate form. It decides the
  language Gemini writes the Pin in, and therefore which Pinterest audience the
  content reaches. An English-speaking operator can produce French Pins.

Plant care data stays canonical in English in the catalog and is handed to the
model as reference; the model composes the Pin directly in the target language.
That avoids maintaining 50 plants x 6 care fields in two languages, where
translation drift would quietly degrade horticultural accuracy.

What *is* translated is the plant **name**, plus its alternative French common
names (`langue de belle-mère`, `fleur de lune`, `plante araignée`…), because
those are what people actually type into Pinterest — they are handed to the
model as usable keyword material.

`locale` is part of the dedupe key, so the same plant + angle in French and in
English are two legitimate Pins rather than a duplicate.

## Architecture

```
app/
  api/
    generate/            POST  - plant + angle -> full Pin
    pins/                GET   - library listing with filters
    pins/[id]/           GET | PATCH | DELETE
    queue/               POST  - queue or schedule a Pin
    stats/               GET   - dashboard counters + readiness
    cron/publish/        GET   - publishing worker (Vercel Cron)
    pinterest/
      status connect callback disconnect boards publish
  page.tsx               Dashboard
  generate/ library/ queue/ pinterest/

lib/
  config.ts        env resolution + readiness report
  gemini.ts        copy + image generation, error normalisation
  prompts.ts       prompt construction (iterate copy quality here)
  pinterest.ts     OAuth, boards, publishing
  publisher.ts     shared publish worker + retry accounting
  engine.ts        orchestration: dedupe -> copy -> image -> host -> save
  images.ts        Blob upload / inline fallback
  crypto.ts        AES-256-GCM token envelope
  store/           pluggable persistence (blob | file | memory)
  data/            plants (50), angles (44), visual styles (10)
```

### Storage

`lib/store` is an interface with three adapters, selected automatically:

1. **Vercel Blob** when a Blob store is attached (production).
2. **Local file** (`.data/state.json`) when running outside Vercel.
3. **In-memory** as a loud last resort.

The state document is stored with `access: 'private'`; only generated Pin images
are public, because Pinterest fetches them by URL. OAuth tokens are AES-256-GCM
encrypted before they ever reach an adapter.

This interface is the seam for a Postgres/Supabase adapter later — no route
handler needs to change.

### Content quality

Three mechanisms keep 1,000 Pins from reading like one Pin:

- **Hook archetypes** — each variation index selects a different rhetorical
  structure (numbered diagnostic, direct question, myth correction…), so
  variation changes the shape of the title, not just its wording.
- **Visual styles** — 10 formats, each rewriting the whole composition brief.
  Styles are matched to the angle category by affinity, then chosen
  deterministically, so a "before/after" layout never lands on a discovery Pin.
- **Title feedback** — titles already generated for a plant are fed back into
  the prompt as an explicit "do not repeat these" list.

### Duplicate prevention

Every Pin carries `dedupeKey = sha256(plant | angle | style | variation)`.
Generating an occupied slot returns HTTP 409 before any Gemini call is made, so
duplicates cost nothing. `allowDuplicate: true` regenerates in place.

---

## Publishing

A Pin only reaches `published` when Pinterest returns a Pin id. A failed publish
records the error, increments `attempts` and returns HTTP 502 — the UI never
shows a false success.

Retry budget is 3 attempts; below that a failure returns the Pin to `queued` for
the cron worker, at the ceiling it moves to `failed` so a broken Pin cannot loop.

`vercel.json` registers the worker hourly. It publishes 5 Pins per run to stay
well inside Pinterest's write limits.

---

## Deploying to Vercel

1. Push to `poolstudioapps/plenova-pinterest-engine` and import the repo.
2. Attach a **Blob store** (Storage tab) — required for publishing.
3. Set env vars: `GEMINI_API_KEY`, `TOKEN_ENCRYPTION_KEY`, `CRON_SECRET`,
   `NEXT_PUBLIC_APP_URL`, and the Pinterest trio once the app is approved.
4. Set `PINTEREST_REDIRECT_URI` to
   `https://<your-domain>/api/pinterest/callback` and register that exact URI on
   the Pinterest app.

---

## Status against the spec

Phases 1–4 are implemented. Phase 5 has its foundations (dedupe keys, variation
system, programmatic `plants × angles × variations` capacity) but no analytics.

**Verified against the live SDK/API:** Gemini model IDs and the
`ai.models.generateContent` surface (structured output + `imageConfig`
aspect ratio) were checked against `@google/genai` 2.21.0 type definitions.
Pinterest's OAuth flow was checked against the official documentation.

**Not yet exercised against a live token:** the `POST /v5/pins` request body.
The endpoint reference sits behind a login wall, so it follows the documented v5
contract but should be re-verified when the developer app is approved. It is
isolated in `publishPin()` in `lib/pinterest.ts` — one function to revisit.

### Pinterest trial access

Tested 2026-09-09 against the app's trial token: every v5 endpoint
(`/user_account`, `/boards`, `/pins`) returns **401**, and the API replies
`"Your application consumer type is not supported"`. Trial tokens on a
pending app cannot read either, not just write.

The engine therefore supports `PINTEREST_ACCESS_TOKEN` as an escape hatch —
Pinterest withholds the app secret during trial review, so OAuth cannot run at
all. The moment the app is approved, either path works with no code change.
`PINTEREST_TOKEN_SCOPES` declares what a manual token actually carries, and
`publishPin()` refuses to attempt a write when `pins:write` is absent rather
than burning a call on a guaranteed rejection.
