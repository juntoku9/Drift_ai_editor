"use client";

import { useMemo, useState } from "react";
import { RichTextEditor } from "@/components/rich-text-editor";
import type { AnalysisResult, DomainTemplate, EditorSnapshot } from "@/lib/types";

interface EditorPanelProps {
  title: string;
  template: DomainTemplate;
  draftHtml: string;
  draftPlainText: string;
  snapshots: EditorSnapshot[];
  loading: boolean;
  hasInsights?: boolean;
  analysis?: AnalysisResult | null;
  onTitleChange: (value: string) => void;
  onTemplateChange: (value: DomainTemplate) => void;
  onDraftChange: (html: string, plainText: string) => void;
  onSaveSnapshot: () => void;
  onAnalyze: () => void;
  onLoadSnapshot: (id: string) => void;
  onDeleteSnapshot: (id: string) => void;
  onInsights?: () => void;
  onBackToLibrary?: () => void;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const SIG_W: Record<string, number> = { high: 3, medium: 2, low: 1 };

const DIRECTION: Record<string, string> = {
  strengthened: "raised",
  weakened: "lowered",
  shifted: "shifted",
  appeared: "new",
  disappeared: "removed",
};

const CHIP_COLOR: Record<string, string> = {
  strengthened: "border-olive/30 bg-olive/8 text-olive",
  weakened: "border-ember/30 bg-ember/8 text-ember",
  shifted: "border-amber-500/30 bg-amber-500/8 text-amber-600",
  appeared: "border-olive/30 bg-olive/8 text-olive",
  disappeared: "border-ember/30 bg-ember/8 text-ember",
};

// ── Helpers ────────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// ── Diff algorithm (line-level LCS) ───────────────────────────────────────────

type DiffLine = { type: "same" | "added" | "removed"; text: string };

function computeLineDiff(oldText: string, newText: string): DiffLine[] {
  const A = oldText.split("\n");
  const B = newText.split("\n");
  const m = A.length;
  const n = B.length;

  // Build LCS table
  const dp = Array.from({ length: m + 1 }, () => new Int32Array(n + 1));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        A[i - 1] === B[j - 1]
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  // Backtrack
  const result: DiffLine[] = [];
  let i = m;
  let j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && A[i - 1] === B[j - 1]) {
      result.unshift({ type: "same", text: A[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ type: "added", text: B[j - 1] });
      j--;
    } else {
      result.unshift({ type: "removed", text: A[i - 1] });
      i--;
    }
  }
  return result;
}

// ── DiffPanel ──────────────────────────────────────────────────────────────────

interface DiffPanelProps {
  snapshot: EditorSnapshot;
  snapshotIndex: number;
  prevSnapshot: EditorSnapshot | null;
  onClose: () => void;
}

function DiffPanel({ snapshot, snapshotIndex, prevSnapshot, onClose }: DiffPanelProps) {
  const lines = useMemo(
    () =>
      prevSnapshot
        ? computeLineDiff(prevSnapshot.content, snapshot.content)
        : computeLineDiff("", snapshot.content),
    [prevSnapshot, snapshot.content],
  );

  const addedCount = lines.filter((l) => l.type === "added").length;
  const removedCount = lines.filter((l) => l.type === "removed").length;
  const unchanged = addedCount === 0 && removedCount === 0;

  return (
    <div className="workspace-canvas overflow-hidden p-0">
      {/* Banner */}
      <div className="flex items-center justify-between border-b border-ink/8 bg-ink/[0.025] px-6 py-3">
        <div className="flex items-center gap-3">
          {prevSnapshot ? (
            <>
              <span className="rounded-md bg-ink/15 px-2 py-0.5 text-xs font-bold text-ink/60">
                V{snapshotIndex}
              </span>
              <span className="text-ink/25">→</span>
            </>
          ) : null}
          <span className="rounded-md bg-ink px-2 py-0.5 text-xs font-bold text-white">
            V{snapshotIndex + 1}
          </span>
          {snapshot.createdByName && (
            <span className="text-sm font-semibold text-ink/70">{snapshot.createdByName}</span>
          )}
          {!unchanged && (
            <span className="flex items-center gap-1.5 text-xs">
              {addedCount > 0 && (
                <span className="rounded-full bg-olive/15 px-2 py-0.5 font-semibold text-olive">
                  +{addedCount}
                </span>
              )}
              {removedCount > 0 && (
                <span className="rounded-full bg-ember/12 px-2 py-0.5 font-semibold text-ember">
                  −{removedCount}
                </span>
              )}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-ink/20 px-3 py-1.5 text-xs font-semibold text-ink/45 hover:bg-ink/5 hover:text-ink"
        >
          Close
        </button>
      </div>

      {/* Diff body */}
      <div className="min-h-[560px] px-8 py-7 font-[var(--font-sans)] text-sm leading-7 md:min-h-[640px]">
        {unchanged ? (
          <p className="text-sm text-ink/50">No changes between this version and the previous one.</p>
        ) : (
          lines.map((line, i) => {
            if (line.type === "same") {
              return (
                <div key={i} className="text-ink/75">
                  {line.text || "\u00A0"}
                </div>
              );
            }
            if (line.type === "added") {
              return (
                <div
                  key={i}
                  className="bg-olive/10 text-olive"
                  style={{ marginLeft: "-2rem", paddingLeft: "2rem", paddingRight: "2rem" }}
                >
                  <span className="mr-2 select-none font-bold opacity-50">+</span>
                  {line.text || "\u00A0"}
                </div>
              );
            }
            return (
              <div
                key={i}
                className="bg-ember/8 text-ember/80 line-through"
                style={{ marginLeft: "-2rem", paddingLeft: "2rem", paddingRight: "2rem" }}
              >
                <span className="mr-2 select-none font-bold opacity-50">−</span>
                {line.text || "\u00A0"}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ── EditorPanel ────────────────────────────────────────────────────────────────

export function EditorPanel({
  title,
  template,
  draftHtml,
  draftPlainText,
  snapshots,
  loading,
  hasInsights,
  analysis,
  onTitleChange,
  onTemplateChange,
  onDraftChange,
  onSaveSnapshot,
  onAnalyze,
  onLoadSnapshot,
  onDeleteSnapshot,
  onInsights,
  onBackToLibrary,
}: EditorPanelProps) {
  const canAnalyze = snapshots.length >= 2;

  // Diff state: which snapshot to compare against current draft
  const [diffSnap, setDiffSnap] = useState<{ snapshot: EditorSnapshot; index: number } | null>(null);


  /* Per-version drift chips from analysis */
  const versionDrifts = snapshots.map((_, i) => {
    const vLabel = `V${i + 1}`;
    if (!analysis) return [];
    return analysis.drifts
      .filter((d) => d.to_version === vLabel)
      .sort((a, b) => (SIG_W[b.significance] ?? 1) - (SIG_W[a.significance] ?? 1))
      .slice(0, 3);
  });

  /* Inflection point: which snapshot index is the "to" version of the turning point */
  const inflectionIndex = useMemo(() => {
    if (!analysis?.inflection_point) return -1;
    const match = analysis.inflection_point.match(/V(\d+)\s*[-–>]+\s*V(\d+)/i);
    if (!match) return -1;
    return parseInt(match[2], 10) - 1; // convert "V3" → index 2
  }, [analysis?.inflection_point]);

  return (
    <section className="workspace-shell">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-[320px] flex-1">
          <div className="mb-1 flex items-center gap-2">
            {onBackToLibrary ? (
              <button
                type="button"
                onClick={onBackToLibrary}
                className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate/80 hover:text-ink"
              >
                Library
              </button>
            ) : null}
            {onBackToLibrary ? (
              <span className="text-[11px] text-slate/40">/</span>
            ) : null}
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate/80">
              Editor
            </p>
          </div>
          <input
            value={title}
            onChange={(event) => onTitleChange(event.target.value)}
            className="w-full border-0 bg-transparent p-0 font-[var(--font-serif)] text-4xl outline-none placeholder:text-ink/40 md:text-5xl"
            placeholder="Untitled Document"
          />
        </div>
        <div className="flex items-center gap-2">
          {onInsights ? (
            <div className="inline-flex items-center rounded-full border border-ink/20 bg-white p-1">
              <span className="rounded-full bg-ink px-4 py-1.5 text-sm font-semibold text-white">
                Editor
              </span>
              <button
                type="button"
                onClick={onInsights}
                disabled={!hasInsights}
                className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                  hasInsights ? "text-ember hover:bg-ember/10" : "text-ink/40"
                } disabled:cursor-not-allowed disabled:opacity-60`}
                aria-label="Switch to Insights"
              >
                Insights
              </button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1fr_420px]">
        {/* ── Main content: editor or diff ── */}
        {diffSnap ? (
          <DiffPanel
            snapshot={diffSnap.snapshot}
            snapshotIndex={diffSnap.index}
            prevSnapshot={diffSnap.index > 0 ? (snapshots[diffSnap.index - 1] ?? null) : null}
            onClose={() => setDiffSnap(null)}
          />
        ) : (
          <div className="workspace-canvas p-4 md:p-5">
            {/* Action bar — top right of canvas */}
            <div className="mb-3 flex items-center justify-end gap-2">
              <span className="mr-auto text-xs text-ink/40">{draftPlainText.length} chars</span>
              <button
                type="button"
                onClick={onSaveSnapshot}
                disabled={loading || draftPlainText.trim().length < 20}
                className="rounded-full border border-ink/25 bg-white px-4 py-2 text-sm font-semibold text-ink/75 hover:border-ink/40 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
              >
                Save Snapshot
              </button>
              <button
                type="button"
                onClick={onAnalyze}
                disabled={loading || !canAnalyze}
                title={!canAnalyze ? "Save at least 2 snapshots first" : undefined}
                className="rounded-full bg-ember px-4 py-2 text-sm font-semibold text-white hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {loading ? "Analyzing…" : "Analyze Drift"}
              </button>
            </div>
            <RichTextEditor
              value={draftHtml}
              onChange={onDraftChange}
              placeholder="Write or paste your latest draft here. Save snapshots as you iterate."
            />
          </div>
        )}

        {/* ── Sidebar ───────────────────────────────────── */}
        <aside className="panel sticky top-6 h-fit space-y-5 p-5 md:p-6">

          {/* ── Headline insight (post-analysis) ── */}
          {analysis?.headline && (
            <div className="rounded-xl border border-ember/20 bg-ember/[0.06] px-4 py-3">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-ember/70">
                Key Finding
              </p>
              <p className="text-sm font-semibold leading-snug text-ink/85">
                {analysis.headline}
              </p>
            </div>
          )}

          {/* ── Pre-analysis nudge (before analysis, ≥2 snapshots) ── */}
          {!analysis && snapshots.length >= 2 && (
            <div className="rounded-xl border border-dashed border-amber-400/40 bg-amber-50/60 px-4 py-3">
              <p className="text-sm font-semibold text-amber-800/80">
                {snapshots.length} versions saved
              </p>
              <p className="mt-0.5 text-xs text-amber-700/60">
                Run Analyze Drift to reveal how meaning changed across versions.
              </p>
            </div>
          )}

          {/* ── Version history ── */}
          <div>
            <div className="mb-4 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate/80">
                History
              </p>
              <span className="rounded-full bg-ink/5 px-2.5 py-1 text-xs font-semibold text-ink/60">
                {snapshots.length}
              </span>
            </div>
            {snapshots.length === 0 ? (
              <p className="rounded-xl border border-dashed border-ink/20 p-4 text-sm text-ink/60">
                No snapshots yet. Save one after each meaningful revision.
              </p>
            ) : (
              <div className="space-y-1">
                  {snapshots.map((snapshot, index) => {
                    const chips = versionDrifts[index] ?? [];
                    const isActive = diffSnap?.snapshot.id === snapshot.id;

                    return (
                      <button
                        key={snapshot.id}
                        type="button"
                        onClick={() =>
                          isActive
                            ? setDiffSnap(null)
                            : setDiffSnap({ snapshot, index })
                        }
                        className={`group w-full rounded-xl px-3 py-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ink/20 ${
                          isActive
                            ? "bg-ink/[0.05]"
                            : "hover:bg-ink/[0.03]"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          {/* Version tag — the dominant visual */}
                          <span
                            className={`relative flex h-7 w-10 shrink-0 items-center justify-center rounded-md text-xs font-bold tracking-wide ${
                              isActive
                                ? "bg-ink text-white"
                                : inflectionIndex === index
                                  ? "bg-ember/15 text-ember ring-1 ring-ember/30"
                                  : "bg-ink/10 text-ink/60 group-hover:bg-ink/15"
                            }`}
                          >
                            V{index + 1}
                            {inflectionIndex === index && (
                              <span className="absolute -right-1 -top-1 flex h-3 w-3 items-center justify-center rounded-full bg-ember text-[7px] text-white">
                                ⚡
                              </span>
                            )}
                          </span>

                          {/* Avatar */}
                          {snapshot.createdByAvatarUrl ? (
                            <img
                              src={snapshot.createdByAvatarUrl}
                              alt={snapshot.createdByName ?? ""}
                              className="h-6 w-6 shrink-0 rounded-full border border-ink/10 object-cover"
                            />
                          ) : (
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink/10 text-xs font-bold text-ink/45">
                              {(snapshot.createdByName ?? "?")[0]}
                            </span>
                          )}

                          {/* Name + time */}
                          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink/80">
                            {snapshot.createdByName ?? "Unknown"}
                          </span>
                          <span className="shrink-0 text-xs text-ink/35 tabular-nums">
                            {timeAgo(snapshot.timestamp)}
                          </span>
                        </div>

                        {/* Role */}
                        {snapshot.createdByRole && (
                          <p className="mt-1 pl-[76px] text-xs text-ink/45">
                            {snapshot.createdByRole}
                          </p>
                        )}

                        {/* Drift chips */}
                        {chips.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-1.5 pl-[76px]">
                            {chips.map((d) => (
                              <span
                                key={d.id}
                                className={`inline-flex items-start gap-1 rounded-full border px-2.5 py-1 text-xs ${CHIP_COLOR[d.type] ?? "border-ink/20 text-ink/50"}`}
                              >
                                <span className="shrink-0 font-semibold opacity-60 pt-px">
                                  {DIRECTION[d.type] ?? "·"}
                                </span>
                                <span className="font-medium">{d.element}</span>
                              </span>
                            ))}
                          </div>
                        )}
                      </button>
                    );
                  })}
              </div>
            )}
          </div>

          {/* Drift score gauge */}
          {analysis && (
            <div className="rounded-xl bg-ink/[0.03] px-4 py-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-ink/40">
                  Drift Score
                </span>
                <span className="text-lg font-bold tabular-nums text-ink/80">
                  {analysis.drift_score}
                </span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink/[0.06]">
                <div
                  className={`h-full rounded-full ${
                    analysis.drift_score >= 66
                      ? "bg-ember"
                      : analysis.drift_score >= 36
                        ? "bg-amber-500"
                        : "bg-olive"
                  }`}
                  style={{ width: `${analysis.drift_score}%` }}
                />
              </div>
            </div>
          )}

          {/* Recommended action */}
          {analysis?.recommended_action && (
            <div className="rounded-xl border border-ink/10 bg-ink/[0.02] px-4 py-3">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink/40">
                Next Step
              </p>
              <p className="text-sm leading-snug text-ink/75">
                {analysis.recommended_action}
              </p>
              {onInsights && hasInsights && (
                <button
                  type="button"
                  onClick={onInsights}
                  className="mt-3 text-xs font-semibold text-ember hover:underline"
                >
                  View full insights →
                </button>
              )}
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
