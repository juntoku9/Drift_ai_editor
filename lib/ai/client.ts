import { analysisResponseSchema, transitionAnalysisSchema, synthesisSchema } from "@/lib/ai/schema";
import { buildTransitionPrompt, buildSynthesisPrompt, DRIFT_TRANSITION_PROMPT, DRIFT_SYNTHESIS_PROMPT } from "@/lib/ai/prompt";
import type { AnalyzeRequest, AnalysisResult, DriftItem, TransitionSummary, VersionInput } from "@/lib/types";
import { getTemplateLabel } from "@/lib/templates";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MAX_MODEL_JSON_RETRIES = 3;
const MAX_MODEL_OUTPUT_TOKENS = 64000;
const MIN_TRANSITION_OUTPUT_TOKENS = 1200;
const MAX_TRANSITION_OUTPUT_TOKENS = 64000;
const TRANSITION_CONCURRENCY = 4;

interface TransitionFailureInfo {
  from_version: string;
  to_version: string;
  reason: string;
}

function summarizeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return "unknown transition model error";
}

function compactErrorDetail(input: string, max = 220): string {
  const oneLine = input.replace(/\s+/g, " ").trim();
  return oneLine.length > max ? `${oneLine.slice(0, max - 1)}...` : oneLine;
}

function extractApiErrorDetail(raw: string): string {
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: string; type?: string } };
    if (parsed?.error?.message) {
      const typed = parsed.error.type ? `${parsed.error.type}: ${parsed.error.message}` : parsed.error.message;
      return compactErrorDetail(typed);
    }
  } catch {
    // keep raw detail
  }
  return compactErrorDetail(raw);
}

function parseJsonFromText(text: string): unknown {
  const attempts: string[] = [];
  attempts.push(text);

  const fenced = extractFencedJson(text);
  if (fenced) attempts.push(fenced);

  const bracketSlice = sliceFirstJsonObject(text);
  if (bracketSlice) attempts.push(bracketSlice);
  attempts.push(...extractAllJsonObjects(text));

  const sanitizedAttempts = attempts.flatMap((candidate) => [
    candidate,
    sanitizeJsonCandidate(candidate),
    sanitizeJsonCandidate(sliceFirstJsonObject(candidate) ?? candidate)
  ]);

  for (const candidate of sanitizedAttempts) {
    try {
      return JSON.parse(candidate);
    } catch {
      // try next
    }
  }

  throw new Error("Model did not return valid JSON.");
}

function extractFencedJson(text: string): string | null {
  const jsonFence = text.match(/```json\s*([\s\S]*?)\s*```/i);
  if (jsonFence?.[1]) return jsonFence[1].trim();
  const anyFence = text.match(/```[\s\S]*?\n([\s\S]*?)\s*```/i);
  return anyFence?.[1]?.trim() ?? null;
}

function sliceFirstJsonObject(text: string): string | null {
  const first = text.indexOf("{");
  if (first < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = first; i < text.length; i += 1) {
    const ch = text[i];

    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") {
      depth += 1;
      continue;
    }
    if (ch === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(first, i + 1);
    }
  }

  return null;
}

function extractAllJsonObjects(text: string): string[] {
  const results: string[] = [];
  for (let start = text.indexOf("{"); start >= 0; start = text.indexOf("{", start + 1)) {
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = start; i < text.length; i += 1) {
      const ch = text[i];

      if (inString) {
        if (escaped) escaped = false;
        else if (ch === "\\") escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }

      if (ch === '"') {
        inString = true;
        continue;
      }
      if (ch === "{") {
        depth += 1;
        continue;
      }
      if (ch === "}") {
        depth -= 1;
        if (depth === 0) {
          results.push(text.slice(start, i + 1));
          break;
        }
      }
    }
  }
  return results;
}

function sanitizeJsonCandidate(input: string): string {
  return input
    .replace(/^\uFEFF/, "")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/,\s*([}\]])/g, "$1")
    .trim();
}

function significanceWeight(sig: DriftItem["significance"]): number {
  if (sig === "high") return 3;
  if (sig === "medium") return 2;
  return 1;
}

function significanceToConfidence(sig: DriftItem["significance"]): number {
  if (sig === "high") return 0.82;
  if (sig === "medium") return 0.68;
  return 0.55;
}

function inferReversibility(axis: DriftItem["decision_axis"]): DriftItem["reversibility"] {
  if (axis === "ownership") return "easy";
  if (axis === "compliance" || axis === "obligation") return "hard";
  return "medium";
}

function inferBlastRadius(axis: DriftItem["decision_axis"]): DriftItem["blast_radius"] {
  if (axis === "compliance" || axis === "economics" || axis === "obligation") return "external";
  if (axis === "timeline" || axis === "scope" || axis === "ownership") return "org";
  return "team";
}

function toStrengthDelta(type: DriftItem["type"], significance: DriftItem["significance"]): number {
  const magnitude = significance === "high" ? 2 : 1;
  if (type === "strengthened" || type === "appeared") return magnitude;
  if (type === "weakened" || type === "disappeared") return -magnitude;
  return 0;
}

function enrichDrift(base: DriftItem): DriftItem {
  const axis = base.decision_axis ?? "scope";
  const significance = base.significance;
  return {
    ...base,
    decision_axis: axis,
    strength_delta: base.strength_delta ?? toStrengthDelta(base.type, significance),
    reversibility: base.reversibility ?? inferReversibility(axis),
    blast_radius: base.blast_radius ?? inferBlastRadius(axis),
    confidence: base.confidence ?? significanceToConfidence(significance),
    evidence_quality: base.evidence_quality ?? "direct"
  };
}

function normalizeDrifts(drifts: DriftItem[]): DriftItem[] {
  return drifts.map((d, i) =>
    enrichDrift({
      ...d,
      id: `d${i + 1}`
    })
  );
}

function sampleEvidence(content: string): string {
  return content.trim().replace(/\s+/g, " ").slice(0, 180);
}

function findCommitments(content: string): string[] {
  const lines = content.split(/[.\n]/).map((l) => l.trim());
  const matches = lines.filter((l) => /\b(will|must|commit|deliver|ship|launch|target|aim|require)\b/i.test(l));
  return (matches.length ? matches : lines.filter(Boolean)).slice(0, 4);
}

function classifyTone(content: string): string {
  if (/\b(tentative|targeting|may|explore|consider|conditional)\b/i.test(content)) return "cautious";
  if (/\b(requirement|must|will|deadline|approved)\b/i.test(content)) return "assertive";
  return "balanced";
}

function classifyScope(content: string): "focused" | "moderate" | "broad" {
  if (/\b(platform|multiple|expanded|broader|all|every)\b/i.test(content)) return "broad";
  if (/\b(focused|single|narrow|specific|wedge)\b/i.test(content)) return "focused";
  return "moderate";
}

function classifyStance(content: string): string {
  if (/\blegal|liability|compliance|disclosure|sign-off|risk\b/i.test(content)) return "risk-managed";
  if (/\bship|launch|execute|throughput|growth\b/i.test(content)) return "execution-driven";
  return "balanced";
}

interface Signals {
  timeline: "firm" | "tentative" | "none";
  scope: "focused" | "moderate" | "broad";
  legal: boolean;
  booking: boolean;
  monetization: boolean;
  geographyCount: number;
  performanceTarget: boolean;
}

function extractSignals(content: string): Signals {
  const text = content.toLowerCase();
  const timelineFirm = /\b(we will|must|approved|fixed|hard gate|final decision|by q[1-4])\b/i.test(content);
  const timelineTentative = /\b(target|tentative|subject to|estimate|aim|conditional|gated)\b/i.test(content);
  const scope = classifyScope(content);
  const legal = /\b(legal|privacy|compliance|disclosure|terms|consent|indemnity|liability)\b/i.test(content);
  const booking = /\b(booking|checkout|one-click|flight|hotel links)\b/i.test(content);
  const monetization = /\b(sponsored|placement|partner|referral|pricing|acv|revenue|valuation|tranche)\b/i.test(content);
  const performanceTarget = /\b(p95|p99|throughput|latency|sla|slo|seconds)\b/i.test(content);
  const geographyHits = ["us", "japan", "italy", "thailand", "apac", "europe", "global", "markets"].filter((token) =>
    text.includes(token)
  ).length;

  return {
    timeline: timelineFirm ? "firm" : timelineTentative ? "tentative" : "none",
    scope,
    legal,
    booking,
    monetization,
    geographyCount: geographyHits,
    performanceTarget
  };
}

function detectSignalDrifts(args: {
  from: VersionInput;
  to: VersionInput;
  fromSignals: Signals;
  toSignals: Signals;
}): DriftItem[] {
  const { from, to, fromSignals, toSignals } = args;
  const drifts: DriftItem[] = [];

  if (fromSignals.timeline !== toSignals.timeline) {
    drifts.push(
      enrichDrift({
        id: "tmp",
        element: "launch timeline certainty",
        type:
          fromSignals.timeline === "firm" && toSignals.timeline !== "firm"
            ? "weakened"
            : toSignals.timeline === "firm"
              ? "strengthened"
              : "shifted",
        decision_axis: "timeline",
        from_version: from.version,
        to_version: to.version,
        from_text: sampleEvidence(from.content),
        to_text: sampleEvidence(to.content),
        significance: fromSignals.timeline === "firm" ? "high" : "medium",
        explanation: `Timeline language changed from ${fromSignals.timeline} to ${toSignals.timeline}.`,
        question_to_ask: "Do stakeholders still share the same timeline commitment?"
      })
    );
  }

  if (fromSignals.legal !== toSignals.legal) {
    drifts.push(
      enrichDrift({
        id: "tmp",
        element: "legal and compliance constraints",
        type: toSignals.legal ? "appeared" : "disappeared",
        decision_axis: "compliance",
        from_version: from.version,
        to_version: to.version,
        from_text: sampleEvidence(from.content),
        to_text: sampleEvidence(to.content),
        significance: "high",
        explanation: toSignals.legal
          ? "Legal/compliance constraints were introduced."
          : "Legal/compliance constraints were reduced.",
        question_to_ask: "Is compliance posture aligned with launch or deal risk?"
      })
    );
  }

  if (fromSignals.scope !== toSignals.scope) {
    drifts.push(
      enrichDrift({
        id: "tmp",
        element: "scope breadth",
        type: "shifted",
        decision_axis: "scope",
        from_version: from.version,
        to_version: to.version,
        from_text: sampleEvidence(from.content),
        to_text: sampleEvidence(to.content),
        significance: "medium",
        explanation: `Scope changed from ${fromSignals.scope} to ${toSignals.scope}.`,
        question_to_ask: "Does the new scope improve outcomes or dilute focus?"
      })
    );
  }

  if (fromSignals.booking !== toSignals.booking) {
    drifts.push(
      enrichDrift({
        id: "tmp",
        element: "booking integration commitment",
        type: toSignals.booking ? "appeared" : "disappeared",
        decision_axis: "obligation",
        from_version: from.version,
        to_version: to.version,
        from_text: sampleEvidence(from.content),
        to_text: sampleEvidence(to.content),
        significance: "medium",
        explanation: toSignals.booking
          ? "Booking-related commitment was added."
          : "Booking-related commitment was deferred or removed.",
        question_to_ask: "Is this commitment realistic for the current phase?"
      })
    );
  }

  if (fromSignals.monetization !== toSignals.monetization) {
    drifts.push(
      enrichDrift({
        id: "tmp",
        element: "economics and monetization posture",
        type: toSignals.monetization ? "appeared" : "disappeared",
        decision_axis: "economics",
        from_version: from.version,
        to_version: to.version,
        from_text: sampleEvidence(from.content),
        to_text: sampleEvidence(to.content),
        significance: "medium",
        explanation: toSignals.monetization
          ? "Economic or monetization language became explicit."
          : "Economic or monetization language was reduced.",
        question_to_ask: "Does this economic posture support the core strategy?"
      })
    );
  }

  if (fromSignals.performanceTarget !== toSignals.performanceTarget) {
    drifts.push(
      enrichDrift({
        id: "tmp",
        element: "performance target clarity",
        type: toSignals.performanceTarget ? "appeared" : "disappeared",
        decision_axis: "risk",
        from_version: from.version,
        to_version: to.version,
        from_text: sampleEvidence(from.content),
        to_text: sampleEvidence(to.content),
        significance: "low",
        explanation: toSignals.performanceTarget
          ? "Measurable performance targets were introduced."
          : "Measurable performance targets were removed.",
        question_to_ask: "Do we still have measurable accountability on performance?"
      })
    );
  }

  if (fromSignals.geographyCount !== toSignals.geographyCount) {
    drifts.push(
      enrichDrift({
        id: "tmp",
        element: "market coverage commitment",
        type: toSignals.geographyCount > fromSignals.geographyCount ? "appeared" : "weakened",
        decision_axis: "scope",
        from_version: from.version,
        to_version: to.version,
        from_text: sampleEvidence(from.content),
        to_text: sampleEvidence(to.content),
        significance: "medium",
        explanation: `Geography references changed from ${fromSignals.geographyCount} to ${toSignals.geographyCount}.`,
        question_to_ask: "Is market coverage aligned with current execution capacity?"
      })
    );
  }

  return drifts;
}

function heuristicTransition(from: VersionInput, to: VersionInput): { drifts: DriftItem[]; transition_summary: TransitionSummary } {
  const fromSignals = extractSignals(from.content);
  const toSignals = extractSignals(to.content);
  const drifts = detectSignalDrifts({ from, to, fromSignals, toSignals });

  const ensured = drifts.length
    ? drifts
    : [
        enrichDrift({
          id: "tmp",
          element: "decision framing shift",
          type: "shifted",
          decision_axis: "risk",
          from_version: from.version,
          to_version: to.version,
          from_text: sampleEvidence(from.content),
          to_text: sampleEvidence(to.content),
          significance: "medium",
          explanation: `Decision framing moved from ${classifyTone(from.content)} to ${classifyTone(to.content)}.`,
          question_to_ask: "Was this framing shift intentional and aligned across stakeholders?"
        })
      ];

  const top = ensured
    .slice()
    .sort((a, b) => significanceWeight(b.significance) - significanceWeight(a.significance))[0];

  return {
    drifts: ensured,
    transition_summary: {
      from_version: from.version,
      to_version: to.version,
      summary: top
        ? `${top.element} ${top.type} (${top.significance}).`
        : "No material semantic drift detected.",
      primary_owner: to.author_name ?? to.author_role ?? "Unknown",
      no_material_drift: !top
    }
  };
}

function estimateTransitionMaxTokens(from: VersionInput, to: VersionInput): number {
  const totalChars = from.content.length + to.content.length;
  const estimatedInputTokens = Math.ceil(totalChars / 4);
  const estimated = 2000 + Math.ceil(estimatedInputTokens * 0.8);
  return Math.max(MIN_TRANSITION_OUTPUT_TOKENS, Math.min(MAX_TRANSITION_OUTPUT_TOKENS, estimated));
}

async function callAnthropicTransition(args: {
  key: string;
  model: string;
  title?: string;
  template?: AnalyzeRequest["template"];
  from: VersionInput;
  to: VersionInput;
}): Promise<{ drifts: DriftItem[]; transition_summary: TransitionSummary }> {
  const outputBudget = estimateTransitionMaxTokens(args.from, args.to);
  let lastErr = "Unknown transition parse failure.";

  for (let attempt = 0; attempt <= MAX_MODEL_JSON_RETRIES; attempt += 1) {
    const retryInstruction =
      attempt === 0
        ? ""
        : `\n\nRETRY ${attempt}: Prior output was invalid JSON. Return only one valid JSON object matching the schema.`;

    const response = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": args.key,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: args.model,
        max_tokens: outputBudget,
        temperature: 0,
        system: DRIFT_TRANSITION_PROMPT,
        messages: [
          {
            role: "user",
            content: `${buildTransitionPrompt({
              title: args.title,
              template: args.template,
              from: args.from,
              to: args.to
            })}${retryInstruction}`
          }
        ]
      }),
      cache: "no-store"
    });

    if (!response.ok) {
      const detail = await response.text();
      const parsedDetail = extractApiErrorDetail(detail);
      throw new Error(`Anthropic API ${response.status}: ${parsedDetail}`);
    }

    const data = (await response.json()) as {
      content?: Array<{ type?: string; text?: string }>;
      stop_reason?: string;
    };

    // Anthropic uses max_tokens when output is truncated.
    if (data.stop_reason === "max_tokens") {
      lastErr = "Transition output was truncated (stop_reason=max_tokens).";
      continue;
    }

    const merged = (data.content ?? [])
      .filter((item) => item.type === "text" && typeof item.text === "string")
      .map((item) => item.text as string)
      .join("\n");

    if (!merged.trim()) {
      lastErr = "Anthropic transition response missing text content.";
      continue;
    }

    try {
      const parsed = parseJsonFromText(merged);
      const validated = transitionAnalysisSchema.safeParse(parsed);
      if (validated.success) {
        // Inject version labels from context — model doesn't include them in drift objects.
        const normalized = validated.data.drifts.map((d, i) =>
          enrichDrift({
            ...d,
            id: `d${i + 1}`,
            from_version: args.from.version,
            to_version: args.to.version
          })
        );
        const top = normalized
          .slice()
          .sort((a, b) => significanceWeight(b.significance) - significanceWeight(a.significance))[0];
        return {
          drifts: normalized,
          transition_summary: {
            from_version: args.from.version,
            to_version: args.to.version,
            summary: top ? `${top.element} ${top.type} (${top.significance}).` : "No material drift detected.",
            primary_owner: args.to.author_name ?? args.to.author_role ?? "Unknown",
            no_material_drift: normalized.length === 0
          }
        };
      }
      lastErr = `Invalid transition JSON (stop_reason=${data.stop_reason ?? "unknown"}).`;
    } catch {
      lastErr = `Failed to parse transition JSON (stop_reason=${data.stop_reason ?? "unknown"}).`;
    }
  }

  throw new Error(lastErr);
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, worker: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  async function runWorker() {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => runWorker());
  await Promise.all(workers);
  return results;
}

function aggregateNarrative(args: {
  template: AnalyzeRequest["template"];
  drifts: DriftItem[];
  transitions: TransitionSummary[];
  versions: VersionInput[];
}): { inflection_point: string; drift_score: number; headline: string; narrative: string; recommended_action: string } {
  const templateLabel = getTemplateLabel(args.template ?? "product_spec");
  const transitionScores = args.transitions.map((t) => {
    const items = args.drifts.filter(
      (d) => d.from_version === t.from_version && d.to_version === t.to_version
    );
    const score = items.reduce((sum, item) => sum + significanceWeight(item.significance), 0);
    return { key: `${t.from_version} -> ${t.to_version}`, score };
  });

  const topTransition = transitionScores.sort((a, b) => b.score - a.score)[0];
  const inflection_point = topTransition?.key ?? `${args.versions[0].version} -> ${args.versions[1].version}`;

  const highCount = args.drifts.filter((d) => d.significance === "high").length;
  const mediumCount = args.drifts.filter((d) => d.significance === "medium").length;
  const drift_score = Math.min(100, 25 + highCount * 14 + mediumCount * 8 + args.drifts.length * 2);

  const headline =
    drift_score >= 70
      ? "Major decision-level shifts occurred across revisions."
      : drift_score >= 40
        ? "Meaningful drift is present in commitments and operating posture."
        : "Document meaning is mostly stable with targeted adjustments.";

  const topAxis =
    Object.entries(
      args.drifts.reduce<Record<string, number>>((acc, item) => {
        const axis = item.decision_axis ?? "scope";
        acc[axis] = (acc[axis] ?? 0) + significanceWeight(item.significance);
        return acc;
      }, {})
    ).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "scope";

  const owners = [...new Set(args.versions.map((v) => v.author_name).filter(Boolean))] as string[];
  const ownerLine = owners.length >= 2 ? `${owners[0]} and ${owners[owners.length - 1]}` : owners[0] ?? "document owner";

  const narrative = `In the ${templateLabel} context, the strongest semantic movement is on ${topAxis}. The largest turning point is ${inflection_point}, where commitment force and risk posture changed most. Cross-owner edits indicate alignment work is still required before downstream execution decisions are considered stable.`;
  const recommended_action = `Schedule a decision review between ${ownerLine} to reconcile ${topAxis}-related drifts and confirm which commitments are binding for the next execution phase.`;

  return { inflection_point, drift_score, headline, narrative, recommended_action };
}

async function callAnthropicSynthesis(args: {
  key: string;
  model: string;
  title?: string;
  template?: AnalyzeRequest["template"];
  versions: Array<{ version: string; author_name?: string; author_role?: string }>;
  drifts: DriftItem[];
}): Promise<{ headline: string; narrative: string; recommended_action: string }> {
  const response = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": args.key,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: args.model,
      max_tokens: 600,
      temperature: 0,
      system: DRIFT_SYNTHESIS_PROMPT,
      messages: [
        {
          role: "user",
          content: buildSynthesisPrompt({
            title: args.title,
            template: args.template,
            versions: args.versions,
            drifts: args.drifts
          })
        }
      ]
    }),
    cache: "no-store"
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Anthropic synthesis API ${response.status}: ${extractApiErrorDetail(detail)}`);
  }

  const data = (await response.json()) as { content?: Array<{ type?: string; text?: string }> };
  const text = (data.content ?? [])
    .filter((item) => item.type === "text" && typeof item.text === "string")
    .map((item) => item.text as string)
    .join("\n");

  const parsed = parseJsonFromText(text);
  const validated = synthesisSchema.safeParse(parsed);
  if (!validated.success) {
    throw new Error("Synthesis response failed schema validation.");
  }
  return validated.data;
}

async function analyzeWithTransitionCalls(input: AnalyzeRequest, apiKey: string, opts: { skipSynthesis?: boolean } = {}): Promise<AnalysisResult> {
  const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";

  const transitions = input.versions.slice(1).map((to, i) => ({
    from: input.versions[i],
    to,
    index: i
  }));

  const t0Transitions = Date.now();
  const transitionResults = await mapWithConcurrency(transitions, TRANSITION_CONCURRENCY, async (pair) => {
    const t0 = Date.now();
    const result = await callAnthropicTransition({
      key: apiKey,
      model,
      title: input.title,
      template: input.template,
      from: pair.from,
      to: pair.to
    });
    console.info("[drift.timing] transition", `${pair.from.version}→${pair.to.version}`, `${Date.now() - t0}ms`);
    return {
      ...result,
      model_failed: false as const,
      warning: null as string | null,
      failure: null as TransitionFailureInfo | null
    };
  });
  console.info("[drift.timing] transitions_phase", `${Date.now() - t0Transitions}ms`);

  const allDrifts = normalizeDrifts(transitionResults.flatMap((r) => r.drifts));
  const transition_summaries = transitionResults.map((r) => r.transition_summary);

  const versions = input.versions.map((v) => ({
    version: v.version,
    timestamp: v.timestamp,
    intent: {
      primary_goal: "Deliver the stated initiative with evolving certainty.",
      commitments: findCommitments(v.content),
      tone: classifyTone(v.content),
      scope: classifyScope(v.content),
      stance: classifyStance(v.content)
    }
  }));

  // Local aggregate gives inflection_point and drift_score (formula-based, always fast).
  const aggregate = aggregateNarrative({
    template: input.template,
    drifts: allDrifts,
    transitions: transition_summaries,
    versions: input.versions
  });

  // AI synthesis: one small call that sees ALL drifts and writes a specific narrative.
  // Skipped when caller requests transitions-only result (skipSynthesis=true).
  const synthesisWarnings: string[] = [];
  let synthesis = {
    headline: aggregate.headline,
    narrative: aggregate.narrative,
    recommended_action: aggregate.recommended_action
  };
  if (!opts.skipSynthesis && allDrifts.length > 0) {
    const t0Synthesis = Date.now();
    synthesis = await callAnthropicSynthesis({
      key: apiKey,
      model,
      title: input.title,
      template: input.template,
      versions: input.versions,
      drifts: allDrifts
    });
    console.info("[drift.timing] synthesis", `${Date.now() - t0Synthesis}ms`);
  }

  const result: AnalysisResult = {
    versions,
    drifts: allDrifts,
    transition_summaries,
    diagnostics: {
      fallback_used: transitionResults.some((r) => r.model_failed),
      transition_model_failures: transitionResults.filter((r) => r.model_failed).length,
      warnings: [
        ...transitionResults.map((r) => r.warning).filter((w): w is string => Boolean(w)),
        ...synthesisWarnings
      ],
      transition_errors: transitionResults
        .map((r) => r.failure)
        .filter((f): f is TransitionFailureInfo => Boolean(f))
    },
    narrative: synthesis.narrative,
    inflection_point: aggregate.inflection_point,
    drift_score: aggregate.drift_score,
    headline: synthesis.headline,
    recommended_action: synthesis.recommended_action
  };

  const validated = analysisResponseSchema.safeParse(result);
  if (!validated.success) {
    throw new Error("Aggregated analysis failed schema validation.");
  }
  return validated.data;
}

function buildHeuristicAnalysis(versions: VersionInput[], template: AnalyzeRequest["template"]): AnalysisResult {
  const input: AnalyzeRequest = { template, versions };

  const transitionResults = versions.slice(1).map((to, i) => heuristicTransition(versions[i], to));
  const drifts = normalizeDrifts(transitionResults.flatMap((r) => r.drifts));
  const transition_summaries = transitionResults.map((r) => r.transition_summary);

  const mapped = versions.map((v) => ({
    version: v.version,
    timestamp: v.timestamp,
    intent: {
      primary_goal: "Deliver the stated initiative with evolving certainty.",
      commitments: findCommitments(v.content),
      tone: classifyTone(v.content),
      scope: classifyScope(v.content),
      stance: classifyStance(v.content)
    }
  }));

  const aggregate = aggregateNarrative({
    template,
    drifts,
    transitions: transition_summaries,
    versions
  });

  return {
    versions: mapped,
    drifts,
    transition_summaries,
    diagnostics: {
      fallback_used: true,
      transition_model_failures: Math.max(1, versions.length - 1),
      warnings: ["Heuristic analyzer used for all transitions."]
    },
    narrative: aggregate.narrative,
    inflection_point: aggregate.inflection_point,
    drift_score: aggregate.drift_score,
    headline: aggregate.headline,
    recommended_action: aggregate.recommended_action
  };
}

export async function analyzeDocument(input: AnalyzeRequest): Promise<AnalysisResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured.");
  return analyzeWithTransitionCalls(input, apiKey);
}

/** Transitions only — runs parallel drift calls, skips the synthesis step.
 *  Use when the client will call /api/analyze/synthesis separately. */
export async function analyzeTransitions(input: AnalyzeRequest): Promise<AnalysisResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured.");
  return analyzeWithTransitionCalls(input, apiKey, { skipSynthesis: true });
}

/** Synthesis only — takes already-computed drifts and generates headline / narrative / action. */
export async function synthesizeAnalysis(args: {
  title?: string;
  template?: AnalyzeRequest["template"];
  versions: Array<{ version: string; author_name?: string; author_role?: string }>;
  drifts: DriftItem[];
}): Promise<{ headline: string; narrative: string; recommended_action: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured.");
  const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";
  const t0 = Date.now();
  const result = await callAnthropicSynthesis({ key: apiKey, model, ...args });
  console.info("[drift.timing] synthesis (standalone)", `${Date.now() - t0}ms`);
  return result;
}
