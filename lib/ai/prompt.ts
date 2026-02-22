import type { AnalyzeRequest, DriftItem } from "@/lib/types";
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

Template guidance:
- prd/product_spec: launch gating, scope movement, reliability-vs-growth tradeoffs, ownership handoffs.
- contract/legal docs: obligations, liability, transfer/termination rights, compliance duties.
- memo (investment/legal): valuation/economics shifts, risk posture changes, governance and decision ownership.

Coverage requirements:
- Each transition must have at least one drift.
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
      "from_version": "V1",
      "to_version": "V2",
      "from_text": "short quote from source",
      "to_text": "short quote from target",
      "significance": "low|medium|high",
      "explanation": "one sentence",
      "question_to_ask": "one sentence"
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

export const DRIFT_TRANSITION_PROMPT = `You are a semantic drift analyst.
Analyze exactly one transition between two document versions.
Return STRICT JSON only.

Focus on decision-level semantic changes, not wording alone.
Use only allowed drift types: strengthened | weakened | shifted | appeared | disappeared

Output JSON schema:
{
  "from_version": "V1",
  "to_version": "V2",
  "drifts": [
    {
      "id": "d1",
      "element": "concrete change label",
      "type": "strengthened|weakened|shifted|appeared|disappeared",
      "from_text": "short quote",
      "to_text": "short quote",
      "significance": "low|medium|high",
      "explanation": "one sentence",
      "question_to_ask": "one sentence"
    }
  ]
}

Rules:
- Element must be concrete and domain-specific (e.g. "launch date commitment", "liability cap").
- "from_text" and "to_text" must be direct short quotes from the provided text.
- Return 2-5 drifts that represent genuine decision-level changes.
- If no material drift exists, return drifts=[].
- Return only JSON, no markdown, no extra keys.`;

export function buildTransitionPrompt(args: {
  title?: string;
  template?: AnalyzeRequest["template"];
  from: AnalyzeRequest["versions"][number];
  to: AnalyzeRequest["versions"][number];
}): string {
  const template = args.template ?? "product_spec";
  const payload = {
    title: args.title ?? "Untitled Document",
    template: getTemplateLabel(template),
    template_guidance: getTemplateGuidance(template),
    from_version: {
      version: args.from.version,
      timestamp: args.from.timestamp ?? "",
      author_name: args.from.author_name ?? "",
      author_role: args.from.author_role ?? "",
      author_handle: args.from.author_handle ?? "",
      content: args.from.content
    },
    to_version: {
      version: args.to.version,
      timestamp: args.to.timestamp ?? "",
      author_name: args.to.author_name ?? "",
      author_role: args.to.author_role ?? "",
      author_handle: args.to.author_handle ?? "",
      content: args.to.content
    }
  };

  return `Analyze this transition:\n${JSON.stringify(payload, null, 2)}`;
}

export const DRIFT_SYNTHESIS_PROMPT = `You are a semantic document analyst.
Given a structured list of semantic drifts found across document versions, synthesize what they mean at the decision level.

Return STRICT JSON only:
{
  "headline": "one specific sentence naming the most significant decision change",
  "narrative": "one paragraph: what changed in decision meaning, why it matters, who must align next",
  "recommended_action": "1-2 sentences: concrete next step naming a specific role or person and action"
}

Rules:
- headline must name the specific element that shifted (e.g. "Q1 launch commitment softened to conditional target" — never generic like "significant drift detected")
- narrative must answer three things: what changed in decision meaning, why it matters to execution, who must align before proceeding
- recommended_action must name a specific role or person and a specific action, not a generic "review"
- Return only JSON, no markdown, no extra keys.`;

export function buildSynthesisPrompt(args: {
  title?: string;
  template?: AnalyzeRequest["template"];
  versions: Array<{ version: string; author_name?: string; author_role?: string }>;
  drifts: DriftItem[];
}): string {
  const templateLabel = getTemplateLabel(args.template ?? "product_spec");

  const versionLines = args.versions
    .map((v) => {
      const parts = [v.version];
      if (v.author_name) parts.push(v.author_name);
      if (v.author_role) parts.push(v.author_role);
      return `- ${parts.join(" · ")}`;
    })
    .join("\n");

  // Group drifts by transition, preserving order.
  const seenKeys: string[] = [];
  const grouped = new Map<string, DriftItem[]>();
  for (const d of args.drifts) {
    const key = `${d.from_version} → ${d.to_version}`;
    if (!grouped.has(key)) {
      grouped.set(key, []);
      seenKeys.push(key);
    }
    grouped.get(key)!.push(d);
  }

  const sigWeight = (s: DriftItem["significance"]) => (s === "high" ? 3 : s === "medium" ? 2 : 1);

  const transitionBlocks = seenKeys.map((key) => {
    const [, toLabel] = key.split(" → ");
    const toVersion = args.versions.find((v) => v.version === toLabel);
    const authorSuffix =
      toVersion?.author_name
        ? `  [${[toVersion.author_name, toVersion.author_role].filter(Boolean).join(" · ")}]`
        : "";

    const driftLines = (grouped.get(key) ?? [])
      .slice()
      .sort((a, b) => sigWeight(b.significance) - sigWeight(a.significance))
      .map((d) =>
        `  [${d.significance.toUpperCase()}] ${d.element}: ${d.type}\n    "${d.from_text}" → "${d.to_text}"\n    ${d.explanation}`
      )
      .join("\n\n");

    return `${key}${authorSuffix}:\n${driftLines}`;
  });

  return `Document: "${args.title ?? "Untitled Document"}" (${templateLabel})

Authors:
${versionLines}

Drifts found:

${transitionBlocks.join("\n\n")}

Synthesize the decision-level meaning of these drifts.`;
}
