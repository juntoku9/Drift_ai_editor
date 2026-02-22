# Drift — Agent Context

This file is for AI agents continuing work on this project. Read it before touching anything.

## What this project is

Drift is a semantic diff tool for collaborative documents. It tracks how *meaning* shifts across versions — not just text edits. Users save snapshots of a document over time, and Drift analyzes the transitions using Claude to surface turning points, stakeholder misalignment, and recommended next actions.

Live at: `drift-beryl.vercel.app`
Repo: `github.com/juntoku9/Drift_ai_editor`

---

## Stack

- **Next.js 15** (App Router, TypeScript)
- **Tailwind CSS v4**
- **Tiptap** — rich text editor
- **Clerk** — auth (optional, key-gated)
- **Neon** — serverless Postgres
- **Drizzle ORM** — schema + queries
- **Anthropic Claude** — semantic analysis (`claude-sonnet-4-6` default)
- **Vercel** — deployment

---

## Key files to know

```
app/page.tsx                  # Entire client shell — all document state lives here
app/layout.tsx                # Wraps with ClerkProvider only when key is present
app/api/analyze/route.ts      # Phase 1: parallel transition analysis via Claude
app/api/analyze/synthesis/    # Phase 2: headline / narrative / recommended_action
app/api/documents/route.ts    # GET (list) + POST (create)
app/api/documents/[id]/       # GET, PUT, DELETE, HEAD — all auth-gated by userId
app/api/demo/route.ts         # Pre-built demo scenarios catalog

components/editor-panel.tsx   # Editor + diff viewer + version history sidebar
components/analysis-view.tsx  # Composes the full Insights page
components/brief/             # Sub-components: verdict, timeline, turning point, alignment, action
components/clerk-user-sync.tsx # SSR-safe bridge for useUser() — loaded with ssr:false

lib/store.ts                  # Document persistence — dual-write (localStorage + Postgres)
lib/db/index.ts               # Drizzle client (throws if DATABASE_URL missing)
lib/db/schema.ts              # Drizzle schema — single `documents` table
lib/types.ts                  # All shared TypeScript types
```

---

## How analysis works

Two-phase pipeline to keep UI fast:

**Phase 1** — `/api/analyze`: all version transitions sent to Claude in parallel. Returns `DriftItem[]` (type, element, significance, from_text, to_text, question_to_ask) plus per-version intent summaries. The UI navigates to Insights as soon as this lands.

**Phase 2** — `/api/analyze/synthesis`: runs after UI shows drift data. Generates headline, narrative, recommended_action from the full drift picture. UI shows skeleton while this runs (`synthesisPending`).

**Incremental mode** — when a new snapshot is added to an existing analysis, only the single new transition is computed and merged client-side. Not a full re-run. This is handled in the `autoAnalyze()` function in `page.tsx`.

---

## Persistence model

Dual-write: localStorage always, Postgres best-effort.

```
saveDocument(doc)
  → localSave(doc)              // sync, always succeeds
  → HEAD /api/documents/:id     // check if row exists
  → POST (create) or PUT (update)
  // 401 = not authed → localStorage only, silent
  // 5xx = no DATABASE_URL → localStorage only, silent
```

`listDocuments()`, `loadDocument()`, `deleteDocument()` all follow the same pattern — try API first, fall back to localStorage on failure.

---

## Auth model

Clerk is **optional**. `app/layout.tsx` only wraps with `<ClerkProvider>` when `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is set. When absent, the app runs fully unauthenticated and all data stays in localStorage.

`components/clerk-user-sync.tsx` is loaded with `dynamic(..., { ssr: false })` — this is intentional. `useUser()` can only run inside ClerkProvider and only client-side. Do not move this call into a server component or remove the `ssr: false`.

---

## Environment variables

```bash
ANTHROPIC_API_KEY=            # Required for analysis
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=  # Optional — enables auth
CLERK_SECRET_KEY=             # Optional — required if above is set
DATABASE_URL=                 # Optional — Neon Postgres for cross-device sync
ANTHROPIC_MODEL=              # Optional — defaults to claude-sonnet-4-6
ALLOW_MOCK_ANALYSIS=true      # Dev only — skips Claude, returns fake data
```

`.env.local` is gitignored. Never commit credentials.

---

## Database

Single table: `documents`. Columns: `id`, `user_id`, `title`, `template`, `draft_html`, `draft_plain_text`, `snapshots` (JSONB), `analysis` (JSONB), `created_at`, `updated_at`.

To push schema changes:
```bash
DATABASE_URL='...' npx drizzle-kit push
```

Drizzle config: `drizzle.config.ts` at root.

---

## Design system

Custom Tailwind tokens defined in `app/globals.css`:
- `ink` — primary text/dark color
- `slate` — secondary text
- `ember` — accent red/orange (high drift, warnings)
- `olive` — accent green (positive signal)
- `panel` — card surface class
- `workspace-shell` / `workspace-canvas` — editor layout classes
- Font: `--font-serif` (used for document titles, quotes, headlines)

---

## Current state (as of last update)

- [x] Editor with rich text (Tiptap), snapshot saving, version history sidebar
- [x] Drift analysis — two-phase (transitions + synthesis), incremental
- [x] Insights page — verdict header, full journey timeline, turning point, alignment panel, action card
- [x] Google Docs-style contributor avatars in editor header (stacked, tooltip on hover)
- [x] Neon Postgres persistence with localStorage fallback
- [x] Clerk auth — optional, key-gated, SSR-safe
- [x] Five demo scenarios loadable from library
- [x] Auto-analyze on snapshot save (background, abortable, incremental)
- [x] Diff viewer — line-level LCS diff between any two snapshots
- [x] Drift chips on version history cards (per-version semantic changes)

## Known gaps / next things to build

- Rate limiting on `/api/analyze` (Anthropic bill risk if public)
- Stakeholder impact ranking panel (ranked leaderboard replacing "Who Needs to Align" flat view)
- Real-time collaboration (multiple users on same doc simultaneously)
- Export to PDF / shareable insight link
- Google Docs import via OAuth (API routes exist at `/api/google/` but not wired to UI)
