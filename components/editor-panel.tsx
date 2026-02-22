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
  analyzingMessage?: string | null;
  autoAnalyzing?: boolean;
  synthesisPending?: boolean;
  autoAnalyzeEnabled?: boolean;
  hasInsights?: boolean;
  analysis?: AnalysisResult | null;
  onTitleChange: (value: string) => void;
  onTemplateChange: (value: DomainTemplate) => void;
  onDraftChange: (html: string, plainText: string) => void;
  onSaveSnapshot: () => void;
  onLoadSnapshot: (id: string) => void;
  onDeleteSnapshot: (id: string) => void;
  onInsights?: () => void;
  onBackToLibrary?: () => void;
  onReanalyze?: () => void;
  onToggleAutoAnalyze?: () => void;
  onClearAnalysis?: () => void;
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
  analyzingMessage,
  autoAnalyzing,
  synthesisPending,
  autoAnalyzeEnabled = true,
  hasInsights,
  analysis,
  onTitleChange,
  onTemplateChange,
  onDraftChange,
  onSaveSnapshot,
  onLoadSnapshot,
  onDeleteSnapshot,
  onInsights,
  onBackToLibrary,
  onReanalyze,
  onToggleAutoAnalyze,
  onClearAnalysis,
}: EditorPanelProps) {
  const canAnalyze = snapshots.length >= 2;

  // Diff state: which snapshot to compare against current draft
  const [diffSnap, setDiffSnap] = useState<{ snapshot: EditorSnapshot; index: number } | null>(null);

  /* Unique contributors from snapshots (deduplicated by name) */
  const contributors = useMemo(() => {
    const seen = new Set<string>();
    const list: { name: string; role?: string; avatarUrl?: string }[] = [];
    for (const snap of snapshots) {
      const name = snap.createdByName ?? "Unknown";
      if (seen.has(name)) continue;
      seen.add(name);
      list.push({ name, role: snap.createdByRole, avatarUrl: snap.createdByAvatarUrl });
    }
    return list;
  }, [snapshots]);


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
        <div className="flex items-center gap-3">
          {/* Contributor avatars — like Google Docs collaborator row */}
          {contributors.length > 0 && (
            <div className="flex items-center">
              {contributors.slice(0, 5).map((c, i) => (
                <div
                  key={c.name}
                  title={c.role ? `${c.name} · ${c.role}` : c.name}
                  className="relative"
                  style={{ marginLeft: i === 0 ? 0 : "-8px", zIndex: contributors.length - i }}
                >
                  {c.avatarUrl ? (
                    <img
                      src={c.avatarUrl}
                      alt={c.name}
                      className="h-8 w-8 rounded-full border-2 border-white object-cover shadow-sm"
                    />
                  ) : (
                    <span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-ink/15 text-xs font-bold text-ink/60 shadow-sm">
                      {c.name[0]}
                    </span>
                  )}
                </div>
              ))}
              {contributors.length > 5 && (
                <span
                  className="relative flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-ink/10 text-[11px] font-bold text-ink/50 shadow-sm"
                  style={{ marginLeft: "-8px" }}
                >
                  +{contributors.length - 5}
                </span>
              )}
            </div>
          )}

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
            </div>
            {loading && analyzingMessage ? (
              <div className="mb-3 rounded-xl border border-amber-300/40 bg-amber-50/70 px-3 py-2">
                <p className="text-xs font-semibold text-amber-800/90">Analysis in progress</p>
                <p className="mt-0.5 text-xs text-amber-700/80">{analyzingMessage}</p>
              </div>
            ) : null}
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
          {analysis?.diagnostics?.transition_model_failures ? (
            <div className="rounded-xl border border-red-300/40 bg-red-50/70 px-4 py-3">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-red-700">
                Analysis Warning
              </p>
              <p className="text-sm font-semibold leading-snug text-red-900/90">
                {analysis.diagnostics.transition_model_failures} transition
                {analysis.diagnostics.transition_model_failures > 1 ? "s" : ""} used fallback
                analysis.
              </p>
              {analysis.diagnostics.transition_errors?.length ? (
                <div className="mt-2 space-y-1">
                  {analysis.diagnostics.transition_errors.map((entry) => (
                    <p key={`${entry.from_version}-${entry.to_version}`} className="text-xs text-red-800/85">
                      {entry.from_version} -&gt; {entry.to_version}: {entry.reason}
                    </p>
                  ))}
                </div>
              ) : analysis.diagnostics.warnings?.length ? (
                <div className="mt-2 space-y-1">
                  {analysis.diagnostics.warnings.slice(0, 3).map((warning, idx) => (
                    <p key={idx} className="text-xs text-red-800/80">
                      {warning}
                    </p>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {/* ── Key Finding / analysis status ── */}
          {autoAnalyzing && !analysis ? (
            <div className="rounded-xl border border-ink/10 bg-ink/[0.03] px-4 py-3">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink/40">
                Analyzing
              </p>
              <div className="space-y-2 animate-pulse">
                <div className="h-3.5 w-full rounded bg-ink/10" />
                <div className="h-3.5 w-4/5 rounded bg-ink/8" />
              </div>
            </div>
          ) : synthesisPending && analysis ? (
            <div className="rounded-xl border border-ember/20 bg-ember/[0.06] px-4 py-3">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-ember/70">
                Key Finding
              </p>
              <div className="space-y-1.5 animate-pulse">
                <div className="h-3.5 w-full rounded bg-ember/15" />
                <div className="h-3.5 w-3/4 rounded bg-ember/10" />
              </div>
            </div>
          ) : analysis?.headline ? (
            <div className="rounded-xl border border-ember/20 bg-ember/[0.06] px-4 py-3">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-ember/70">
                Key Finding
              </p>
              <p className="text-sm font-semibold leading-snug text-ink/85">
                {analysis.headline}
              </p>
            </div>
          ) : snapshots.length === 1 ? (
            <div className="rounded-xl border border-dashed border-ink/15 px-4 py-3">
              <p className="text-sm text-ink/50">
                Save one more snapshot to start live analysis.
              </p>
            </div>
          ) : null}

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
          {autoAnalyzing && !analysis ? (
            <div className="rounded-xl bg-ink/[0.03] px-4 py-3 animate-pulse">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-[0.1em] text-ink/40">
                  Drift Score
                </span>
                <div className="h-5 w-8 rounded bg-ink/10" />
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink/[0.06]">
                <div className="h-full w-1/3 rounded-full bg-ink/10" />
              </div>
            </div>
          ) : analysis ? (
            <div className={`rounded-xl bg-ink/[0.03] px-4 py-3 transition-opacity ${autoAnalyzing ? "opacity-50" : ""}`}>
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
                  className={`h-full rounded-full transition-all duration-700 ${
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
          ) : null}

          {/* Recommended action */}
          {synthesisPending && analysis ? (
            <div className="rounded-xl border border-ink/10 bg-ink/[0.02] px-4 py-3 animate-pulse">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink/40">
                Next Step
              </p>
              <div className="space-y-1.5">
                <div className="h-3 w-full rounded bg-ink/8" />
                <div className="h-3 w-4/5 rounded bg-ink/6" />
              </div>
            </div>
          ) : analysis?.recommended_action ? (
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
          ) : null}

          {/* ── Analysis controls ── */}
          <div className="border-t border-ink/8 pt-4 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink/35">
                Analysis
              </p>
              <div className="flex items-center gap-1.5">
                {analysis && onClearAnalysis ? (
                  <button
                    type="button"
                    onClick={onClearAnalysis}
                    className="rounded-full px-2.5 py-1 text-[11px] font-medium text-ink/35 hover:bg-ink/5 hover:text-ink/60"
                  >
                    Clear
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={onReanalyze}
                  disabled={autoAnalyzing || snapshots.length < 2}
                  className="flex items-center gap-1 rounded-full border border-ink/15 px-2.5 py-1 text-[11px] font-semibold text-ink/50 hover:border-ink/30 hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
                >
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none" className={autoAnalyzing ? "animate-spin" : ""}>
                    <path d="M10.5 6A4.5 4.5 0 1 1 6 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                    <path d="M10.5 1.5v3h-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  {autoAnalyzing ? "Running…" : "Re-run"}
                </button>
              </div>
            </div>

            {/* Auto-analyze toggle */}
            <button
              type="button"
              onClick={onToggleAutoAnalyze}
              className="flex w-full items-center justify-between rounded-xl px-3 py-2.5 hover:bg-ink/[0.03] transition-colors"
            >
              <div className="text-left">
                <span className="block text-xs font-medium text-ink/70">Auto-analyze on save</span>
                <span className="block text-[11px] text-ink/40">
                  {autoAnalyzeEnabled ? "Runs after each snapshot" : "Manual only"}
                </span>
              </div>
              <span
                className={`flex h-5 w-9 shrink-0 items-center rounded-full p-0.5 transition-colors ${
                  autoAnalyzeEnabled ? "bg-ink" : "bg-ink/20"
                }`}
              >
                <span
                  className={`h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                    autoAnalyzeEnabled ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </span>
            </button>
          </div>
        </aside>
      </div>
    </section>
  );
}
