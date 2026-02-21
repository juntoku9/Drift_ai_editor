# Drift

Drift helps teams see how decision meaning changes as important documents evolve.

Instead of only tracking text edits, Drift tracks semantic movement:
- what changed in intent
- why that change matters
- where the biggest shift happened
- who should align next

## Why Drift

In high-stakes docs, small wording changes can quietly shift commitments, risk, ownership, and timeline.

Drift gives teams a fast answer to:
- Are we still making the same decision?
- Did risk posture change?
- Who introduced the key shift?
- What should happen next?

## Who It Is For

Drift is useful for teams working on:
- product specs and PRDs
- contracts and legal docs
- investment or strategy memos
- any document that goes through multiple owners and revisions

## Core Experience

Drift has two modes.

1. `Editor`
- Draft rich text
- Choose a template (`product_spec`, `contract`, `prd`, `memo`)
- Save snapshots over time
- Add author identity context (name/role/handle/avatar)

2. `Insights`
- Analyze transitions (`Vn -> Vn+1`)
- See turning points and top drifts
- Review evidence (before/after)
- Understand alignment risk and handoffs
- Get a concrete recommended next action

## 3-Minute Walkthrough

1. Create a document in the Library.
2. Write and save at least two snapshots.
3. Click `Analyze Drift`.
4. Read the Insights panel:
- key headline and drift score
- turning point transition
- who needs to align
- recommended action

That is the main product loop.

## Example Use Cases

1. Product Launch Governance
- Detect when a launch plan shifts from committed to tentative.
- Spot ownership handoffs that introduce risk.

2. Contract Negotiation
- Track changes in obligations, liability, and compliance language.
- Catch hidden shifts before legal sign-off.

3. Investment Memo Evolution
- See when recommendation strength weakens or becomes conditional.
- Identify which revision changed the decision thesis.

4. Cross-Functional Handoffs
- Understand when edits from different roles create misalignment.
- Turn semantic drift into explicit alignment actions.

## Demo Scenarios

Drift includes realistic demo scenarios you can load from the Library to explore the workflow quickly.

## Local Run (Minimal)

```bash
npm install
npm run dev
```

Set `.env.local` with:
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
- `CLERK_SECRET_KEY`
- `ANTHROPIC_API_KEY`

Optional:
- `ANTHROPIC_MODEL=claude-sonnet-4-6`
- `ALLOW_MOCK_ANALYSIS=true`

## Current Product Scope

- Editor-first workflow (snapshots are the source of truth)
- Template-aware semantic analysis
- Transition-centric insights with human handoff context
- Local document/snapshot persistence (DB-backed collaboration is next)
