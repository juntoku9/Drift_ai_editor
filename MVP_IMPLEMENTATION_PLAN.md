# Drift MVP Status + Plan

## 1) Current MVP State

Drift is now an editor-first semantic analysis product.

Implemented:
- Clerk auth (App Router) + middleware route protection
- Rich text editor (Tiptap) with template selector
- Snapshot workflow (save/load/remove)
- Snapshot author context (`name`, `role`, `handle`, `avatar`)
- Template-aware semantic analysis API
- Insights mode with transition-based review + decision-first selected-transition panel
- Demo scenarios loaded from `demo/scenarios/*.json`
- Demo personas with realistic people profiles for context-rich transitions
- Improved fallback drift labeling with concrete elements
- JSON parsing hardening before fallback (fenced JSON extraction/sanitization)

## 2) Current User Flow

1. Open app in `Editor` mode.
2. Select template (`Product Spec`, `Contract`, `PRD`, `Memo`).
3. Write/edit document content.
4. Save 2+ snapshots.
5. Click `Analyze Drift`.
6. Review `Insights` mode:
- transition list (`Vn -> Vn+1`)
- selected transition decision context
- human handoff context (`who -> who`)
- compact evidence + action recommendation
- quantitative alignment metrics

## 3) Architecture Snapshot

Frontend:
- `app/page.tsx`: mode management (`editor` vs `insights`)
- `components/editor-panel.tsx`
- `components/rich-text-editor.tsx`
- `components/analysis-view.tsx`

Backend:
- `POST /api/analyze`
- `GET /api/demo`
- optional Google backend routes (`/api/google/*`)

Core logic:
- `lib/ai/prompt.ts`
- `lib/ai/client.ts`
- `lib/ai/schema.ts`
- `lib/demo-scenarios.ts`

Auth:
- `middleware.ts`
- `app/layout.tsx`
- `app/sign-in/[[...sign-in]]/page.tsx`
- `app/sign-up/[[...sign-up]]/page.tsx`

## 4) Demo Scenario System

Scenario files:
- `demo/scenarios/ai_travel_launch_governance.json`
- `demo/scenarios/enterprise_contract_negotiation.json`

API behavior:
- `GET /api/demo` -> default scenario
- `GET /api/demo?id=<scenario_id>` -> chosen scenario

## 5) Known Constraints

1. Google Docs history ingestion is not the primary path.
- Revision metadata may be available but full historical text export is inconsistent.
- Editor snapshots remain the reliable source for semantic drift.

2. If model call fails and fallback is enabled:
- heuristic analyzer runs
- now uses concrete drift elements, but quality is still below full model analysis

3. Quantitative transition metrics are currently heuristic/UI-derived.
- Future iteration should move these to model-validated fields and confidence-backed scoring.

## 6) Next MVP Improvements (Priority Order)

1. Persistence + async multiplayer foundation
- move snapshots/docs from localStorage to DB
- support document membership + role-based access

2. Insight quality hardening
- add explicit `change_driver` fields (`legal`, `engineering`, `gtm`, `exec`, `risk`)
- add confidence per drift and transition-level confidence
- add model-side quantitative fields (not only derived UI metrics)

3. Better demo UX
- add demo scenario picker in header
- allow “load scenario without immediate analyze”

4. Export & handoff
- export selected snapshot and insights report
- shareable read-only insight page

## 7) Operational Checklist

Run locally:
1. `npm install`
2. set `.env.local` with:
   - `ANTHROPIC_API_KEY`
   - `ANTHROPIC_MODEL=claude-sonnet-4-6`
3. `npm run dev`

Build validation:
1. `npm run build`
2. `npm run typecheck`

## 8) Definition of MVP-Complete

MVP is complete when:
1. User can draft and save snapshots with clear author identity context.
2. User can run template-aware analysis on snapshots.
3. Insights view clearly communicates decision-level meaning shifts, alignment risk, and next action.
4. Demo scenarios convincingly show real-world semantic drift plus human handoff dynamics.
