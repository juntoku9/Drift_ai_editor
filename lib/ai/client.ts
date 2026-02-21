import { analysisResponseSchema } from "@/lib/ai/schema";
import { buildUserPrompt, DRIFT_SYSTEM_PROMPT } from "@/lib/ai/prompt";
import type { AnalyzeRequest, AnalysisResult, DriftItem, VersionInput } from "@/lib/types";
import { getTemplateLabel } from "@/lib/templates";

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const MAX_MODEL_JSON_RETRIES = 3;
const MAX_MODEL_OUTPUT_TOKENS = 64000;
const MIN_MODEL_OUTPUT_TOKENS = 12000;

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
      // Try next strategy.
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
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === "\"") {
        inString = false;
      }
      continue;
    }

    if (ch === "\"") {
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
        return text.slice(first, i + 1);
      }
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
        if (escaped) {
          escaped = false;
        } else if (ch === "\\") {
          escaped = true;
        } else if (ch === "\"") {
          inString = false;
        }
        continue;
      }

      if (ch === "\"") {
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
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    // Remove trailing commas before object/array close.
    .replace(/,\s*([}\]])/g, "$1")
    .trim();
}

function parseAndValidateModelText(text: string): AnalysisResult | null {
  const candidates = [text];
  const fenced = extractFencedJson(text);
  if (fenced) candidates.push(fenced);

  for (const candidate of candidates) {
    try {
      const parsed = parseJsonFromText(candidate);
      const validated = analysisResponseSchema.safeParse(parsed);
      if (validated.success) {
        const qualityChecked = enforceAnalysisQuality(validated.data);
        if (qualityChecked) return qualityChecked;
      }
    } catch {
      // Continue candidate attempts.
    }
  }
  return null;
}

function enforceAnalysisQuality(result: AnalysisResult): AnalysisResult | null {
  const genericElements = new Set([
    "scope",
    "timeline",
    "intent shift",
    "change",
    "update",
    "drift"
  ]);
  if (result.drifts.some((d) => genericElements.has(d.element.trim().toLowerCase()))) {
    return null;
  }

  const versions = result.versions.map((v) => v.version);
  const requiredPairs: Array<[string, string]> = [];
  for (let i = 1; i < versions.length; i += 1) {
    requiredPairs.push([versions[i - 1], versions[i]]);
  }

  const covered = new Set(
    result.drifts.map((d) => `${d.from_version}->${d.to_version}`)
  );
  const summarized = new Set(
    (result.transition_summaries ?? []).map((t) => `${t.from_version}->${t.to_version}`)
  );
  for (const [from, to] of requiredPairs) {
    const key = `${from}->${to}`;
    if (!covered.has(key) && !summarized.has(key)) return null;
  }

  return result;
}

function buildHeuristicAnalysis(versions: VersionInput[], template: AnalyzeRequest["template"]): AnalysisResult {
  const templateLabel = getTemplateLabel(template ?? "product_spec");
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

  const drifts: DriftItem[] = [];
  let id = 1;

  for (let i = 1; i < versions.length; i += 1) {
    const prev = versions[i - 1];
    const next = versions[i];
    const prevSignals = extractSignals(prev.content);
    const nextSignals = extractSignals(next.content);
    const pairDrifts = detectSignalDrifts({
      from: prev,
      to: next,
      fromSignals: prevSignals,
      toSignals: nextSignals,
      idStart: id
    });
    id += pairDrifts.length;
    drifts.push(...pairDrifts);
  }

  // Ensure at least one row-level drift exists per transition.
  if (drifts.length < versions.length - 1) {
    for (let i = 1; i < versions.length; i += 1) {
      const prev = versions[i - 1];
      const next = versions[i];
      const exists = drifts.some(
        (item) => item.from_version === prev.version && item.to_version === next.version
      );
      if (exists) continue;
      drifts.push(enrichDrift({
        id: `d${id++}`,
        element: "intent framing shift",
        type: "shifted",
        decision_axis: "risk",
        from_version: prev.version,
        to_version: next.version,
        from_text: sampleEvidence(prev.content),
        to_text: sampleEvidence(next.content),
        significance: "medium",
        explanation: `Framing moved from ${classifyTone(prev.content)} to ${classifyTone(next.content)}.`,
        question_to_ask: "Is this transition intentional for stakeholders?"
      }));
    }
  }

  const inflectionIndex = Math.max(1, Math.floor(versions.length / 2));
  const inflection_point = `${versions[inflectionIndex - 1].version} -> ${versions[inflectionIndex].version}`;
  const highCount = drifts.filter((d) => d.significance === "high").length;
  const drift_score = Math.min(100, 35 + drifts.length * 12 + highCount * 15);

  const humanFactorSentence = buildHumanFactorNarrative(versions, drifts);

  const authorNames = versions.map((v) => v.author_name).filter(Boolean);
  const uniqueAuthors = [...new Set(authorNames)];
  const headlineText =
    drift_score >= 66
      ? "Significant meaning shifts detected across document versions."
      : drift_score >= 36
        ? "Moderate drift in commitments and scope across revisions."
        : "Minor adjustments with meaning largely preserved.";
  const actionText =
    uniqueAuthors.length >= 2
      ? `Schedule alignment between ${uniqueAuthors[0]} and ${uniqueAuthors[uniqueAuthors.length - 1]} on the key areas of drift.`
      : "Review the flagged transitions with the document owner before proceeding.";

  const transition_summaries = versions.slice(1).map((toSnapshot, index) => {
    const fromSnapshot = versions[index];
    const pair = drifts.filter(
      (item) =>
        item.from_version === fromSnapshot.version && item.to_version === toSnapshot.version
    );
    const top = pair
      .slice()
      .sort((a, b) => {
        const sig = { high: 3, medium: 2, low: 1 };
        return (sig[b.significance] ?? 0) - (sig[a.significance] ?? 0);
      })[0];
    return {
      from_version: fromSnapshot.version,
      to_version: toSnapshot.version,
      summary: top
        ? `${top.element} ${top.type} (${top.significance}).`
        : "No material semantic drift detected.",
      primary_owner: toSnapshot.author_name ?? toSnapshot.author_role ?? "Unknown",
      no_material_drift: pair.length === 0
    };
  });

  return {
    versions: mapped,
    drifts,
    transition_summaries,
    narrative: `Within the ${templateLabel} context, the document moves from direct commitments toward broader and more conditional language. As edits accumulate, certainty softens and scope broadens. ${humanFactorSentence}`,
    inflection_point,
    drift_score,
    headline: headlineText,
    recommended_action: actionText
  };
}

function buildHumanFactorNarrative(versions: VersionInput[], drifts: DriftItem[]): string {
  const transitions = versions.length - 1;
  if (transitions <= 0) return "";

  let handoffs = 0;
  for (let i = 1; i < versions.length; i += 1) {
    const from = versions[i - 1].author_name?.trim();
    const to = versions[i].author_name?.trim();
    if (from && to && from !== to) handoffs += 1;
  }

  const uniqueRoles = new Set(versions.map((v) => v.author_role).filter(Boolean)).size;
  const highDrifts = drifts.filter((d) => d.significance === "high").length;
  return `Human factor: ${handoffs}/${transitions} transitions were cross-owner handoffs across ${uniqueRoles || 1} roles, with ${highDrifts} high-significance shifts to align.`;
}

function findCommitments(content: string): string[] {
  const lines = content.split(/[.\n]/).map((l) => l.trim());
  const matches = lines.filter((l) =>
    /\b(will|must|commit|deliver|ship|launch|target|aim)\b/i.test(l)
  );
  return (matches.length ? matches : lines.filter(Boolean)).slice(0, 3);
}

function classifyTone(content: string): string {
  if (/\b(tentative|targeting|may|explore|consider)\b/i.test(content)) return "cautious";
  if (/\b(requirement|must|will|by\s+\w+)\b/i.test(content)) return "assertive";
  return "neutral";
}

function classifyScope(content: string): "focused" | "moderate" | "broad" {
  if (/\b(platform|multiple|expanded|broader|all teams)\b/i.test(content)) return "broad";
  if (/\b(focused|single|narrow|specific)\b/i.test(content)) return "focused";
  return "moderate";
}

function classifyStance(content: string): string {
  if (/\blegal|liability|disclaimer|subject to\b/i.test(content)) return "risk-managed";
  if (/\bship|launch|execute|deadline\b/i.test(content)) return "delivery-driven";
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

function significanceToConfidence(significance: DriftItem["significance"]): number {
  if (significance === "high") return 0.82;
  if (significance === "medium") return 0.68;
  return 0.55;
}

function inferReversibility(axis: DriftItem["decision_axis"]): DriftItem["reversibility"] {
  if (axis === "timeline" || axis === "scope") return "medium";
  if (axis === "ownership") return "easy";
  if (axis === "compliance" || axis === "obligation") return "hard";
  return "medium";
}

function inferBlastRadius(axis: DriftItem["decision_axis"]): DriftItem["blast_radius"] {
  if (axis === "timeline" || axis === "scope" || axis === "ownership") return "org";
  if (axis === "compliance" || axis === "economics" || axis === "obligation") return "external";
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

function extractSignals(content: string): Signals {
  const text = content.toLowerCase();
  const timelineFirm = /\b(we will|must|will ship|will launch|by [a-z]+ \d{1,2}|by q[1-4])\b/i.test(content);
  const timelineTentative = /\b(targeting|tentative|subject to|estimate|aim|under evaluation)\b/i.test(content);
  const scope = classifyScope(content);
  const legal = /\b(legal|privacy|compliance|disclaimer|not guaranteed|terms|deletion)\b/i.test(content);
  const booking = /\b(booking|checkout|one-click|flight booking)\b/i.test(content);
  const monetization = /\b(sponsored|placement|partner|referral|ads|campaign)\b/i.test(content);
  const performanceTarget = /\b(p95|under \d+\s*seconds|response time|latency)\b/i.test(content);
  const geographyHits = [
    "us",
    "japan",
    "italy",
    "thailand",
    "apac",
    "europe",
    "global",
    "markets"
  ].filter((token) => text.includes(token)).length;

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
  idStart: number;
}): DriftItem[] {
  const { from, to, fromSignals, toSignals } = args;
  const drifts: DriftItem[] = [];
  let id = args.idStart;

  if (fromSignals.timeline !== toSignals.timeline) {
    drifts.push(enrichDrift({
      id: `d${id++}`,
      element: "launch timeline certainty",
      type:
        fromSignals.timeline === "firm" && toSignals.timeline !== "firm"
          ? "weakened"
          : toSignals.timeline === "firm"
            ? "strengthened"
            : "shifted",
      from_version: from.version,
      to_version: to.version,
      from_text: sampleEvidence(from.content),
      to_text: sampleEvidence(to.content),
      significance: fromSignals.timeline === "firm" ? "high" : "medium",
      decision_axis: "timeline",
      explanation: `Timeline language changed from ${fromSignals.timeline} to ${toSignals.timeline}.`,
      question_to_ask: "Do stakeholders still have a reliable launch commitment?"
    }));
  }

  if (fromSignals.legal !== toSignals.legal) {
    drifts.push(enrichDrift({
      id: `d${id++}`,
      element: "legal and compliance constraints",
      type: toSignals.legal ? "appeared" : "disappeared",
      from_version: from.version,
      to_version: to.version,
      from_text: sampleEvidence(from.content),
      to_text: sampleEvidence(to.content),
      significance: "high",
      decision_axis: "compliance",
      explanation: toSignals.legal
        ? "Legal/privacy constraint language was introduced."
        : "Legal/privacy guardrails were reduced or removed.",
      question_to_ask: "Are legal constraints aligned with risk tolerance?"
    }));
  }

  if (fromSignals.scope !== toSignals.scope) {
    drifts.push(enrichDrift({
      id: `d${id++}`,
      element: "scope breadth",
      type:
        fromSignals.scope === "focused" && toSignals.scope === "broad"
          ? "appeared"
          : "shifted",
      from_version: from.version,
      to_version: to.version,
      from_text: sampleEvidence(from.content),
      to_text: sampleEvidence(to.content),
      significance: "medium",
      decision_axis: "scope",
      explanation: `Scope changed from ${fromSignals.scope} to ${toSignals.scope}.`,
      question_to_ask: "Does this scope change improve strategy or dilute focus?"
    }));
  }

  if (fromSignals.booking !== toSignals.booking) {
    drifts.push(enrichDrift({
      id: `d${id++}`,
      element: "booking integration commitment",
      type: toSignals.booking ? "appeared" : "disappeared",
      from_version: from.version,
      to_version: to.version,
      from_text: sampleEvidence(from.content),
      to_text: sampleEvidence(to.content),
      significance: "medium",
      decision_axis: "obligation",
      explanation: toSignals.booking
        ? "Direct booking capabilities were added to scope."
        : "Direct booking capabilities were deferred or removed.",
      question_to_ask: "Is the booking promise realistic for current phase?"
    }));
  }

  if (fromSignals.monetization !== toSignals.monetization) {
    drifts.push(enrichDrift({
      id: `d${id++}`,
      element: "monetization and growth posture",
      type: toSignals.monetization ? "appeared" : "disappeared",
      from_version: from.version,
      to_version: to.version,
      from_text: sampleEvidence(from.content),
      to_text: sampleEvidence(to.content),
      significance: "medium",
      decision_axis: "economics",
      explanation: toSignals.monetization
        ? "Growth/monetization language became explicit."
        : "Growth/monetization language was deprioritized.",
      question_to_ask: "Does monetization pressure change the product’s core intent?"
    }));
  }

  if (fromSignals.geographyCount !== toSignals.geographyCount) {
    drifts.push(enrichDrift({
      id: `d${id++}`,
      element: "market coverage commitment",
      type: toSignals.geographyCount > fromSignals.geographyCount ? "appeared" : "weakened",
      from_version: from.version,
      to_version: to.version,
      from_text: sampleEvidence(from.content),
      to_text: sampleEvidence(to.content),
      significance: "medium",
      decision_axis: "scope",
      explanation: `Geography coverage references changed from ${fromSignals.geographyCount} to ${toSignals.geographyCount}.`,
      question_to_ask: "Is market expansion supported by delivery capacity?"
    }));
  }

  if (fromSignals.performanceTarget !== toSignals.performanceTarget) {
    drifts.push(enrichDrift({
      id: `d${id++}`,
      element: "performance target clarity",
      type: toSignals.performanceTarget ? "appeared" : "disappeared",
      from_version: from.version,
      to_version: to.version,
      from_text: sampleEvidence(from.content),
      to_text: sampleEvidence(to.content),
      significance: "low",
      decision_axis: "risk",
      explanation: toSignals.performanceTarget
        ? "Measurable latency/performance goals were introduced."
        : "Measurable latency/performance goals were removed.",
      question_to_ask: "Do we still have measurable performance accountability?"
    }));
  }

  return drifts;
}

function sampleEvidence(content: string): string {
  return content.trim().replace(/\s+/g, " ").slice(0, 180);
}

function estimateMaxOutputTokens(input: AnalyzeRequest): number {
  const totalChars = input.versions.reduce((sum, version) => sum + version.content.length, 0);
  const transitionCount = Math.max(1, input.versions.length - 1);
  const estimatedInputTokens = Math.ceil(totalChars / 4);

  // Base budget + scaling by input size and transition complexity.
  const estimated =
    8000 +
    Math.ceil(estimatedInputTokens * 0.75) +
    transitionCount * 1800;

  return Math.max(
    MIN_MODEL_OUTPUT_TOKENS,
    Math.min(MAX_MODEL_OUTPUT_TOKENS, estimated)
  );
}

async function callAnthropic(input: AnalyzeRequest, key: string): Promise<AnalysisResult> {
  const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";
  const outputTokenBudget = estimateMaxOutputTokens(input);
  let lastParseError = "Unknown parse failure.";

  for (let attempt = 0; attempt <= MAX_MODEL_JSON_RETRIES; attempt += 1) {
    const retryInstruction =
      attempt === 0
        ? ""
        : `\n\nRETRY ${attempt}: Your prior answer was invalid JSON. Return ONLY one valid JSON object that exactly matches the required schema. No markdown, no commentary.`;
    const body = {
      model,
      max_tokens: outputTokenBudget,
      temperature: 0,
      system: DRIFT_SYSTEM_PROMPT,
      messages: [{ role: "user", content: `${buildUserPrompt(input)}${retryInstruction}` }]
    };

    const response = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify(body),
      cache: "no-store"
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Anthropic API error (${response.status}): ${detail}`);
    }

    const data = (await response.json()) as {
      content?: Array<{ type?: string; text?: string }>;
      stop_reason?: string;
    };
    const textBlocks = (data.content ?? [])
      .filter((item) => item.type === "text" && typeof item.text === "string")
      .map((item) => item.text as string);
    const merged = textBlocks.join("\n");
    if (!merged.trim()) {
      lastParseError = "Anthropic response missing text content.";
      continue;
    }

    const validated = parseAndValidateModelText(merged);
    if (validated) {
      return validated;
    }

    const stopReason = data.stop_reason ?? "unknown";
    lastParseError = `Invalid model JSON after attempt ${attempt + 1} (stop_reason=${stopReason}).`;
  }

  throw new Error(lastParseError);
}

export async function analyzeDocument(input: AnalyzeRequest): Promise<AnalysisResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    const allowMock = process.env.ALLOW_MOCK_ANALYSIS === "true";
    if (!allowMock) {
      throw new Error("ANTHROPIC_API_KEY is not configured.");
    }
    return buildHeuristicAnalysis(input.versions, input.template);
  }

  try {
    return await callAnthropic(input, apiKey);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown analysis error.";
    // If the model repeatedly truncates/returns invalid JSON, return a deterministic
    // heuristic analysis so the user is not blocked by model formatting limits.
    if (/max_tokens|Invalid model JSON|missing text content/i.test(message)) {
      return buildHeuristicAnalysis(input.versions, input.template);
    }
    throw error;
  }
}
