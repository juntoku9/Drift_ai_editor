import { z } from "zod";

export const versionInputSchema = z.object({
  version: z.string().min(1),
  timestamp: z.string().optional(),
  content: z.string().min(20),
  author_name: z.string().optional(),
  author_role: z.string().optional(),
  author_handle: z.string().optional(),
  author_avatar_url: z.string().url().optional()
});

export const analyzeRequestSchema = z.object({
  title: z.string().optional(),
  template: z.enum(["product_spec", "contract", "prd", "memo"]).optional(),
  versions: z.array(versionInputSchema).min(2).max(10)
});

export const driftItemSchema = z.object({
  id: z.string(),
  element: z.string(),
  type: z.enum(["strengthened", "weakened", "shifted", "appeared", "disappeared"]),
  decision_axis: z
    .enum(["timeline", "scope", "obligation", "risk", "ownership", "compliance", "economics"])
    .default("scope"),
  strength_delta: z.number().int().min(-2).max(2).default(0),
  reversibility: z.enum(["easy", "medium", "hard"]).default("medium"),
  blast_radius: z.enum(["team", "org", "external"]).default("team"),
  confidence: z.number().min(0).max(1).default(0.6),
  evidence_quality: z.enum(["direct", "inferred"]).default("direct"),
  from_version: z.string(),
  to_version: z.string(),
  from_text: z.string(),
  to_text: z.string(),
  significance: z.enum(["low", "medium", "high"]),
  explanation: z.string(),
  question_to_ask: z.string()
});

export const transitionSummarySchema = z.object({
  from_version: z.string(),
  to_version: z.string(),
  summary: z.string(),
  primary_owner: z.string(),
  no_material_drift: z.boolean()
});

// Lean schema for per-transition calls.
// from_version/to_version are omitted — model often skips them as redundant with the outer
// wrapper, and they are assigned from context after parsing.
const transitionDriftSchema = z.object({
  id: z.string(),
  element: z.string(),
  type: z.enum(["strengthened", "weakened", "shifted", "appeared", "disappeared"]),
  from_text: z.string(),
  to_text: z.string(),
  significance: z.enum(["low", "medium", "high"]),
  explanation: z.string(),
  question_to_ask: z.string()
});

export const transitionAnalysisSchema = z.object({
  from_version: z.string(),
  to_version: z.string(),
  drifts: z.array(transitionDriftSchema)
});

export const analysisResponseSchema = z.object({
  versions: z.array(
    z.object({
      version: z.string(),
      timestamp: z.string().optional(),
      intent: z.object({
        primary_goal: z.string(),
        commitments: z.array(z.string()),
        tone: z.string(),
        scope: z.string(),
        stance: z.string()
      })
    })
  ),
  drifts: z.array(driftItemSchema),
  transition_summaries: z.array(transitionSummarySchema).default([]),
  diagnostics: z
    .object({
      fallback_used: z.boolean(),
      transition_model_failures: z.number().int().min(0),
      warnings: z.array(z.string()),
      transition_errors: z
        .array(
          z.object({
            from_version: z.string(),
            to_version: z.string(),
            reason: z.string()
          })
        )
        .optional()
    })
    .optional(),
  narrative: z.string(),
  inflection_point: z.string(),
  drift_score: z.number().int().min(0).max(100),
  headline: z.string(),
  recommended_action: z.string()
});

export const synthesisSchema = z.object({
  headline: z.string(),
  narrative: z.string(),
  recommended_action: z.string()
});

export type AnalyzeRequestSchema = z.infer<typeof analyzeRequestSchema>;
export type AnalysisResponseSchema = z.infer<typeof analysisResponseSchema>;
