export type DriftType =
  | "strengthened"
  | "weakened"
  | "shifted"
  | "appeared"
  | "disappeared";

export type Significance = "low" | "medium" | "high";
export type DomainTemplate = "product_spec" | "contract" | "prd" | "memo";
export type DecisionAxis =
  | "timeline"
  | "scope"
  | "obligation"
  | "risk"
  | "ownership"
  | "compliance"
  | "economics";
export type Reversibility = "easy" | "medium" | "hard";
export type BlastRadius = "team" | "org" | "external";

export interface VersionInput {
  version: string;
  timestamp?: string;
  content: string;
  author_name?: string;
  author_role?: string;
  author_handle?: string;
  author_avatar_url?: string;
}

export interface AnalyzeRequest {
  title?: string;
  template?: DomainTemplate;
  versions: VersionInput[];
}

export interface VersionIntent {
  primary_goal: string;
  commitments: string[];
  tone: string;
  scope: string;
  stance: string;
}

export interface SemanticVersion {
  version: string;
  timestamp?: string;
  intent: VersionIntent;
}

export interface DriftItem {
  id: string;
  element: string;
  type: DriftType;
  decision_axis?: DecisionAxis;
  strength_delta?: number;
  reversibility?: Reversibility;
  blast_radius?: BlastRadius;
  confidence?: number;
  evidence_quality?: "direct" | "inferred";
  from_version: string;
  to_version: string;
  from_text: string;
  to_text: string;
  significance: Significance;
  explanation: string;
  question_to_ask: string;
}

export interface TransitionSummary {
  from_version: string;
  to_version: string;
  summary: string;
  primary_owner: string;
  no_material_drift: boolean;
}

export interface AnalysisResult {
  versions: SemanticVersion[];
  drifts: DriftItem[];
  transition_summaries?: TransitionSummary[];
  narrative: string;
  inflection_point: string;
  drift_score: number;
  headline: string;
  recommended_action: string;
}

export interface EditorSnapshot {
  id: string;
  label: string;
  timestamp: string;
  content: string;
  richContent?: string;
  source: "manual" | "google" | "demo";
  createdById?: string;
  createdByName?: string;
  createdByRole?: string;
  createdByHandle?: string;
  createdByAvatarUrl?: string;
}

export interface DriftDocument {
  id: string;
  title: string;
  template: DomainTemplate;
  createdAt: string;
  updatedAt: string;
  draftHtml: string;
  draftPlainText: string;
  snapshots: EditorSnapshot[];
  analysis: AnalysisResult | null;
}

export interface DocumentDigest {
  id: string;
  title: string;
  template: DomainTemplate;
  createdAt: string;
  updatedAt: string;
  snapshotCount: number;
  driftScore: number | null;
  headline: string | null;
}
