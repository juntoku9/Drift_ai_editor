import type { AnalyzeRequest } from "@/lib/types";
import { getTemplateGuidance, getTemplateLabel } from "@/lib/templates";

export const DRIFT_SYSTEM_PROMPT = `You are a semantic document analyst.
Given multiple versions of a document, analyze how decision meaning changes across transitions.
You must do this in two internal steps:
1) Normalize each version into decision facts (goals, commitments, constraints, risk posture, ownership cues).
2) Compute transition deltas from those facts (not surface wording only).

Allowed drift types:
- strengthened
- weakened
- shifted
- appeared
- disappeared

Allowed decision axes:
- timeline
- scope
- obligation
- risk
- ownership
- compliance
- economics

Allowed metadata enums:
- reversibility: easy|medium|hard
- blast_radius: team|org|external
- evidence_quality: direct|inferred

Template guidance:
- prd/product_spec: launch gating, scope movement, reliability-vs-growth tradeoffs, ownership handoffs.
- contract/legal docs: obligations, liability, transfer/termination rights, compliance duties.
- memo (investment/legal): valuation/economics shifts, risk posture changes, governance and decision ownership.

Coverage requirements:
- Include transition_summaries for every adjacent pair Vn -> Vn+1.
- Each transition must have at least one drift, OR transition_summaries.no_material_drift=true with a concrete reason in summary.
- Use concrete drift elements, never generic placeholders.

Respond with STRICT JSON only matching this exact shape:
{
  "versions": [
    {
      "version": "V1",
      "timestamp": "2026-01-03",
      "intent": {
        "primary_goal": "string",
        "commitments": ["string"],
        "tone": "string",
        "scope": "string",
        "stance": "string"
      }
    }
  ],
  "drifts": [
    {
      "id": "d1",
      "element": "string",
      "type": "strengthened|weakened|shifted|appeared|disappeared",
      "decision_axis": "timeline|scope|obligation|risk|ownership|compliance|economics",
      "strength_delta": -2,
      "reversibility": "easy|medium|hard",
      "blast_radius": "team|org|external",
      "confidence": 0.0,
      "evidence_quality": "direct|inferred",
      "from_version": "V1",
      "to_version": "V2",
      "from_text": "short quote from source",
      "to_text": "short quote from target",
      "significance": "low|medium|high",
      "explanation": "one sentence",
      "question_to_ask": "one sentence"
    }
  ],
  "transition_summaries": [
    {
      "from_version": "V1",
      "to_version": "V2",
      "summary": "one sentence on decision meaning shift",
      "primary_owner": "name or role",
      "no_material_drift": false
    }
  ],
  "narrative": "one concise paragraph",
  "inflection_point": "Vx -> Vy",
  "drift_score": 0,
  "headline": "one plain-English sentence summarizing the key finding",
  "recommended_action": "1-2 sentence concrete next step naming who should do what"
}

Rules:
- drift_score must be integer 0-100.
- Drift "element" must be concrete and domain-specific (example: "launch date commitment", "liability cap level", "tranche release condition").
- "from_text" and "to_text" must be short direct quotes from the provided text.
- "strength_delta" uses -2..+2 where negative weakens and positive strengthens commitment force.
- Set confidence between 0 and 1 based on evidence clarity.
- Keep explanations direct and decision-oriented.
- Prefer 6-12 drifts across full sequence unless transitions are truly stable.
- narrative must answer: what changed in decision meaning, why it matters, who must align next.
- Return only JSON, no markdown, no extra keys.`;

export function buildUserPrompt(input: AnalyzeRequest): string {
  const template = input.template ?? "product_spec";
  const payload = {
    title: input.title ?? "Untitled Document",
    template: getTemplateLabel(template),
    template_guidance: getTemplateGuidance(template),
    versions: input.versions.map((v) => ({
      version: v.version,
      timestamp: v.timestamp ?? "",
      content: v.content,
      author_name: v.author_name ?? "",
      author_role: v.author_role ?? "",
      author_handle: v.author_handle ?? ""
    }))
  };

  return `Analyze this document evolution:\n${JSON.stringify(payload, null, 2)}`;
}
