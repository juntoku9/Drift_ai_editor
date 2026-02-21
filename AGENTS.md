# Drift Agent Guide (Current)

This doc describes the current product direction and implementation contract for Drift.

## Product Definition

Drift is an editor-first semantic evolution tool for high-stakes documents.

Core value:
- capture document snapshots over time
- detect semantic drift across transitions
- explain what changed, why it matters, where the biggest shift happened, and who drove it

## Current UX Model

Two primary surfaces:
1. `Editor` mode
- rich text drafting (Tiptap)
- template selection (`product_spec`, `contract`, `prd`, `memo`)
- snapshot save/load/remove
- snapshot identity context (`name`, `role`, `handle`, `avatar`)
2. `Insights` mode
- transition-based semantic analysis view
- transition list + selected transition detail panel
- decision-first insight panel:
  - decision impact summary
  - compact evidence (before/after)
  - top drifts by impact
  - action recommendation (approvers + unblock question)
  - human handoff context (owner changes)
  - quantitative alignment metrics

`Analyze Drift` moves user from Editor to Insights.

## Key Product Decisions

1. Editor-first source of truth
- External doc providers (e.g., Google Docs) do not reliably expose full historical revision content for native docs.
- Drift snapshots are canonical history for analysis.

2. Domain templates
- Analysis is template-aware to increase precision and usefulness.
- No generic one-size-fits-all semantic logic.

3. Transition-centric insights
- Timeline and drift map are combined into a transition model (`Vn -> Vn+1`) for clarity.

## What Is Implemented

- Next.js App Router + TypeScript + Tailwind
- Clerk authentication (App Router)
- Route protection via `middleware.ts` using `clerkMiddleware()`
- Rich editor using Tiptap
- Local snapshot persistence (`localStorage`)
- Template-aware analyze API (`POST /api/analyze`)
- Structured AI output validation with Zod
- Heuristic fallback analyzer (improved concrete drift elements)
- Resilient model JSON parsing (fenced JSON extraction + sanitization before fallback)
- Demo scenario loader from JSON files under `demo/scenarios`
- Run Demo endpoint (`GET /api/demo`) with scenario catalog support
- Demo persona simulation with realistic people identity context (name/role/handle/avatar)
- Insights view with:
  - drift score
  - inflection point
  - transition rows with owner context
  - selected transition decision panel
  - top-level quantitative metrics (`alignment score`, `handoff rate`, `volatility index`)
  - selected-transition quantitative metrics (`meaning shift`, `alignment risk`, `certainty/scope/risk delta`)

## Demo Data

Demo scenarios live in:
- `demo/scenarios/ai_travel_launch_governance.json`
- `demo/scenarios/enterprise_contract_negotiation.json`

`GET /api/demo` returns default scenario payload.
`GET /api/demo?id=<scenario_id>` returns specific scenario.

## Google Integration Status

Backend OAuth/import routes still exist (`/api/google/*`) for best-effort ingestion and diagnostics.

Current primary UI does not expose Google import controls. Product focus is editor-first workflow.

## AI Rules

- JSON-only model output
- evidence required for drifts (`from_text`, `to_text`)
- drift types limited to:
  - `strengthened`
  - `weakened`
  - `shifted`
  - `appeared`
  - `disappeared`
- drift `element` must be concrete (not generic placeholders)
- include human-factor context when author metadata is provided

## Environment Variables

Required:
- `ANTHROPIC_API_KEY`
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`

Recommended:
- `ANTHROPIC_MODEL=claude-sonnet-4-6`

Optional (Google backend routes only):
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`

## Quality Expectations

- Drift labels must be specific and actionable.
- Insights should prioritize readability over visual clutter.
- Transition-level context should be immediately understandable.
- Selected transition panel must answer in under 10 seconds:
  - what changed in decision meaning
  - how large the change is (quant)
  - who changed it / who must align
  - what action is recommended
- Demo content must feel like real internal docs, not marketing copy.
- Human-factor context should feel like team workflow tooling (Slack/Docs style identity cues).

## Immediate Next Priorities

1. Persist documents/snapshots in DB (move beyond `localStorage`)
2. Add workspace sharing and member-level permissions
3. Add scenario picker in UI for multi-demo testing
4. Add export/share workflows for insights
