"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { AnalysisView } from "@/components/analysis-view";
import { DocumentList } from "@/components/document-list";
import { EditorPanel } from "@/components/editor-panel";
import { plainTextToHtml } from "@/lib/rich-text";
import {
  createDocument,
  deleteDocument,
  listDocuments,
  loadDocument,
  migrateFromV1,
  saveDocument,
} from "@/lib/store";
import type {
  AnalysisResult,
  DocumentDigest,
  DomainTemplate,
  DriftDocument,
  EditorSnapshot,
  VersionInput
} from "@/lib/types";

export default function HomePage() {
  const authorProfileKey = "drift-demo-author-profile-v1";

  // Top-level navigation: null = library, string = open document
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"editor" | "insights">("editor");
  const [documents, setDocuments] = useState<DocumentDigest[]>([]);
  const [migrationDone, setMigrationDone] = useState(false);

  // Document-level state
  const [docCreatedAt, setDocCreatedAt] = useState<string>(new Date().toISOString());
  const [title, setTitle] = useState("Untitled Document");
  const [template, setTemplate] = useState<DomainTemplate>("product_spec");
  const [draftHtml, setDraftHtml] = useState("<p></p>");
  const [draftPlainText, setDraftPlainText] = useState("");
  const [snapshots, setSnapshots] = useState<EditorSnapshot[]>([]);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [synthesisPending, setSynthesisPending] = useState(false);
  const [autoAnalyzing, setAutoAnalyzing] = useState(false);
  const [autoAnalyzeEnabled, setAutoAnalyzeEnabled] = useState(true);
  const [toast, setToast] = useState<{ message: string; done: boolean; mountKey: number } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysisProgress, setAnalysisProgress] = useState<string | null>(null);
  const [demoCatalog, setDemoCatalog] = useState<Array<{ id: string; name: string }>>([]);
  const [authorModalOpen, setAuthorModalOpen] = useState(false);
  const [authorName, setAuthorName] = useState("");
  const [authorRole, setAuthorRole] = useState("");

  const canAnalyze = useMemo(() => snapshots.length >= 2, [snapshots]);

  // Ref to track whether we're currently loading a doc (skip auto-save during load)
  const isLoadingDoc = useRef(false);
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoAnalysisAbortRef = useRef<AbortController | null>(null);

  // Migration + load index on mount
  useEffect(() => {
    migrateFromV1();
    void listDocuments().then((docs) => {
      setDocuments(docs);
      setMigrationDone(true);
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function loadDemoCatalog() {
      try {
        const response = await fetch("/api/demo");
        const data = await response.json();
        if (cancelled) return;
        const scenarios = Array.isArray(data.scenarios) ? data.scenarios : [];
        setDemoCatalog(scenarios);
      } catch {
        // Ignore catalog load errors here; runDemo handles its own failure states.
      }
    }
    void loadDemoCatalog();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    try {
      const savedRaw = localStorage.getItem(authorProfileKey);
      if (!savedRaw) return;
      const saved = JSON.parse(savedRaw) as { name?: string; role?: string };
      setAuthorName(saved.name?.trim() ?? "");
      setAuthorRole(saved.role?.trim() ?? "");
    } catch {
      // Ignore invalid saved profile.
    }
  }, [authorProfileKey]);

  // Open a document by id
  const openDocument = useCallback((id: string) => {
    isLoadingDoc.current = true;
    setActiveDocId(id);
    setViewMode("editor");
    setError(null);
    void loadDocument(id).then((doc) => {
      if (!doc) { isLoadingDoc.current = false; return; }
      setDocCreatedAt(doc.createdAt);
      setTitle(doc.title);
      setTemplate(doc.template);
      setDraftHtml(doc.draftHtml);
      setDraftPlainText(doc.draftPlainText);
      setSnapshots(doc.snapshots);
      setAnalysis(doc.analysis);
      requestAnimationFrame(() => { isLoadingDoc.current = false; });
    });
  }, []);

  // Return to library
  const goToLibrary = useCallback(() => {
    setActiveDocId(null);
    setViewMode("editor");
    setError(null);
    void listDocuments().then(setDocuments);
  }, []);

  // Auto-save active document when state changes
  useEffect(() => {
    if (!activeDocId || isLoadingDoc.current || !migrationDone) return;
    const doc: DriftDocument = {
      id: activeDocId,
      title,
      template,
      createdAt: docCreatedAt,
      updatedAt: new Date().toISOString(),
      draftHtml,
      draftPlainText,
      snapshots,
      analysis,
    };
    void saveDocument(doc);
  }, [activeDocId, docCreatedAt, title, template, draftHtml, draftPlainText, snapshots, analysis, migrationDone]);

  // Create a new document and open it
  function handleCreate() {
    const doc = createDocument();
    setDocCreatedAt(doc.createdAt);
    void saveDocument(doc);
    openDocument(doc.id);
  }

  // Delete a document from library
  function handleDelete(id: string) {
    setDocuments((prev) => prev.filter((d) => d.id !== id)); // optimistic
    void deleteDocument(id);
  }

  function mapSnapshotsToVersions(input: EditorSnapshot[]): VersionInput[] {
    return input.map((snapshot, index) => ({
      version: `V${index + 1}`,
      timestamp: snapshot.timestamp,
      content: snapshot.content,
      author_name: snapshot.createdByName,
      author_role: snapshot.createdByRole,
      author_handle: snapshot.createdByHandle,
      author_avatar_url: snapshot.createdByAvatarUrl
    }));
  }

  function getSnapshotAuthor(snapshot: EditorSnapshot): string {
    if (!snapshot.createdByName) return "Unknown";
    if (snapshot.createdByRole) return `${snapshot.createdByName} (${snapshot.createdByRole})`;
    return snapshot.createdByName;
  }

  const transitionActors = useMemo(() => {
    const entries = snapshots.slice(1).map((toSnapshot, index) => {
      const fromSnapshot = snapshots[index];
      const transitionLabel = `V${index + 1} -> V${index + 2}`;
      return [
        transitionLabel,
        {
          fromAuthor: getSnapshotAuthor(fromSnapshot),
          toAuthor: getSnapshotAuthor(toSnapshot),
          fromRole: fromSnapshot.createdByRole,
          toRole: toSnapshot.createdByRole,
          fromHandle: fromSnapshot.createdByHandle,
          toHandle: toSnapshot.createdByHandle,
          fromAvatarUrl: fromSnapshot.createdByAvatarUrl,
          toAvatarUrl: toSnapshot.createdByAvatarUrl
        }
      ] as const;
    });
    return Object.fromEntries(entries);
  }, [snapshots]);

  async function analyze(payload: { title: string; template: DomainTemplate; versions: VersionInput[] }) {
    setLoading(true);
    setError(null);
    setAnalysis(null);
    setSynthesisPending(false);
    const transitions = Math.max(1, payload.versions.length - 1);
    const phases = [
      `Preparing ${transitions} transition${transitions > 1 ? "s" : ""}...`,
      `Analyzing transitions in parallel (${transitions})...`,
      "Detecting semantic drift...",
      "Building timeline..."
    ];
    let phaseIndex = 0;
    setAnalysisProgress(phases[phaseIndex]);
    if (progressTimerRef.current) clearInterval(progressTimerRef.current);
    progressTimerRef.current = setInterval(() => {
      phaseIndex = (phaseIndex + 1) % phases.length;
      setAnalysisProgress(phases[phaseIndex]);
    }, 1800);
    try {
      // Phase 1: transitions only — navigate to insights as soon as drifts arrive
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Analysis failed.");
      }
      setAnalysis(data);
      setViewMode("insights");
      setLoading(false);
      if (progressTimerRef.current) {
        clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
      }
      setAnalysisProgress(null);

      // Phase 2: synthesis — fills in headline / narrative / recommended_action
      setSynthesisPending(true);
      try {
        const synthVersions = payload.versions.map((v, i) => ({
          version: `V${i + 1}`,
          author_name: v.author_name,
          author_role: v.author_role
        }));
        const synthResponse = await fetch("/api/analyze/synthesis", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: payload.title,
            template: payload.template,
            versions: synthVersions,
            drifts: data.drifts
          })
        });
        if (synthResponse.ok) {
          const synthData = await synthResponse.json();
          setAnalysis((prev) =>
            prev ? { ...prev, ...synthData } : prev
          );
        }
      } finally {
        setSynthesisPending(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error.");
      if (progressTimerRef.current) {
        clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
      }
      setAnalysisProgress(null);
      setLoading(false);
    }
  }

  async function runDemo(demoId: string) {
    setLoading(true);
    setError(null);
    try {
      const query = demoId ? `?id=${encodeURIComponent(demoId)}` : "";
      const response = await fetch(`/api/demo${query}`);
      const demo = await response.json();
      if (Array.isArray(demo.scenarios)) {
        setDemoCatalog(demo.scenarios);
      }

      // Always create a new document for the demo
      const doc = createDocument({
        title: demo.title,
        template: demo.template ?? "product_spec",
      });
      void saveDocument(doc);
      setDocCreatedAt(doc.createdAt);

      // Open the new doc
      isLoadingDoc.current = true;
      setActiveDocId(doc.id);
      setViewMode("editor");
      setTitle(demo.title);
      setTemplate(demo.template ?? "product_spec");

      const demoSnapshots = (demo.versions as VersionInput[]).map((item, index) => {
        const persona = inferDemoPersona(item, index);
        return {
          id: `demo-${index + 1}`,
          label: `(${persona.name})`,
          timestamp: item.timestamp ?? new Date().toISOString(),
          content: item.content,
          richContent: plainTextToHtml(item.content),
          source: "demo" as const,
          createdById: persona.id,
          createdByName: persona.name,
          createdByRole: persona.role,
          createdByHandle: persona.handle,
          createdByAvatarUrl: persona.avatarUrl
        };
      });
      setSnapshots(demoSnapshots);
      const latestDemoText = demo.versions[demo.versions.length - 1]?.content ?? "";
      setDraftHtml(plainTextToHtml(latestDemoText));
      setDraftPlainText(latestDemoText);
      setAnalysis(null);
      requestAnimationFrame(() => {
        isLoadingDoc.current = false;
      });

      await analyze(demo);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load demo.");
      setLoading(false);
    }
  }

  function saveSnapshot() {
    if (draftPlainText.trim().length < 20) {
      setError("Snapshot must have at least 20 characters.");
      return;
    }
    setAuthorModalOpen(true);
    setError(null);
  }

  function confirmSaveSnapshot() {
    const name = authorName.trim();
    const role = authorRole.trim();
    if (!name || !role) {
      setError("Name and role are required to save a snapshot.");
      return;
    }
    if (draftPlainText.trim().length < 20) {
      setError("Snapshot must have at least 20 characters.");
      return;
    }
    localStorage.setItem(authorProfileKey, JSON.stringify({ name, role }));
    setError(null);
    const newSnapshot: EditorSnapshot = {
      id: crypto.randomUUID(),
      label: `(manual ${snapshots.length + 1})`,
      timestamp: new Date().toISOString(),
      content: draftPlainText.trim(),
      richContent: draftHtml,
      source: "manual",
      createdById: name.toLowerCase().replace(/\s+/g, "-"),
      createdByName: name,
      createdByRole: role
    };
    const newSnapshots = [...snapshots, newSnapshot];
    setSnapshots(newSnapshots);
    setAuthorModalOpen(false);
    if (newSnapshots.length >= 2 && autoAnalyzeEnabled) {
      void autoAnalyze(newSnapshots);
    }
  }

  async function autoAnalyze(currentSnapshots: EditorSnapshot[], forceFullRerun = false) {
    // Abort any in-flight background analysis and restart fresh
    autoAnalysisAbortRef.current?.abort();
    const controller = new AbortController();
    autoAnalysisAbortRef.current = controller;

    setAutoAnalyzing(true);
    setSynthesisPending(false);

    // Capture current analysis at call time (avoids stale closure mid-await)
    const existingAnalysis = analysis;
    const n = currentSnapshots.length;

    // Incremental: existing analysis covers all but the last snapshot →
    // only compute the single new transition instead of re-running everything.
    const isIncremental =
      !forceFullRerun &&
      existingAnalysis !== null &&
      n === existingAnalysis.versions.length + 1;

    const driftLabel = isIncremental
      ? `V${n - 1} → V${n}`
      : `${n - 1} transition${n - 1 !== 1 ? "s" : ""}`;
    openToast(`Computing drift ${driftLabel}…`);

    try {
      let mergedAnalysis: AnalysisResult;

      if (isIncremental && existingAnalysis) {
        // ── Phase 1 (incremental): one new transition only ─────────────────
        const prevSnap = currentSnapshots[n - 2];
        const newSnap = currentSnapshots[n - 1];
        const pairVersions: VersionInput[] = [
          {
            version: `V${n - 1}`,
            content: prevSnap.content,
            timestamp: prevSnap.timestamp,
            author_name: prevSnap.createdByName,
            author_role: prevSnap.createdByRole,
            author_handle: prevSnap.createdByHandle,
            author_avatar_url: prevSnap.createdByAvatarUrl
          },
          {
            version: `V${n}`,
            content: newSnap.content,
            timestamp: newSnap.timestamp,
            author_name: newSnap.createdByName,
            author_role: newSnap.createdByRole,
            author_handle: newSnap.createdByHandle,
            author_avatar_url: newSnap.createdByAvatarUrl
          }
        ];
        const response = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, template, versions: pairVersions }),
          signal: controller.signal
        });
        if (controller.signal.aborted) return;
        if (!response.ok) return;
        const partial: AnalysisResult = await response.json();

        // Merge new version entry and drifts into existing analysis
        const newVersionEntry = partial.versions.find((v) => v.version === `V${n}`);
        const mergedVersions = newVersionEntry
          ? [...existingAnalysis.versions, newVersionEntry]
          : existingAnalysis.versions;
        // Re-index drift IDs to avoid collisions
        const mergedDrifts = [...existingAnalysis.drifts, ...partial.drifts].map((d, i) => ({
          ...d,
          id: `d${i + 1}`
        }));
        const mergedSummaries = [
          ...(existingAnalysis.transition_summaries ?? []),
          ...(partial.transition_summaries ?? [])
        ];

        // Recompute aggregates using the same formula as server-side aggregateNarrative
        const transitionScores = mergedSummaries.map((t) => {
          const weight = mergedDrifts
            .filter((d) => d.from_version === t.from_version && d.to_version === t.to_version)
            .reduce(
              (sum, d) => sum + (d.significance === "high" ? 3 : d.significance === "medium" ? 2 : 1),
              0
            );
          return { key: `${t.from_version} -> ${t.to_version}`, weight };
        });
        const topTransition = transitionScores.sort((a, b) => b.weight - a.weight)[0];
        const inflection_point = topTransition?.key ?? existingAnalysis.inflection_point;
        const highCount = mergedDrifts.filter((d) => d.significance === "high").length;
        const mediumCount = mergedDrifts.filter((d) => d.significance === "medium").length;
        const drift_score = Math.min(100, 25 + highCount * 14 + mediumCount * 8 + mergedDrifts.length * 2);

        mergedAnalysis = {
          ...existingAnalysis,
          versions: mergedVersions,
          drifts: mergedDrifts,
          transition_summaries: mergedSummaries,
          inflection_point,
          drift_score,
          diagnostics: {
            fallback_used:
              (existingAnalysis.diagnostics?.fallback_used ?? false) ||
              (partial.diagnostics?.fallback_used ?? false),
            transition_model_failures:
              (existingAnalysis.diagnostics?.transition_model_failures ?? 0) +
              (partial.diagnostics?.transition_model_failures ?? 0),
            warnings: [
              ...(existingAnalysis.diagnostics?.warnings ?? []),
              ...(partial.diagnostics?.warnings ?? [])
            ],
            transition_errors: [
              ...(existingAnalysis.diagnostics?.transition_errors ?? []),
              ...(partial.diagnostics?.transition_errors ?? [])
            ]
          }
        };
      } else {
        // ── Phase 1 (full): all transitions in parallel ────────────────────
        const response = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, template, versions: mapSnapshotsToVersions(currentSnapshots) }),
          signal: controller.signal
        });
        if (controller.signal.aborted) return;
        if (!response.ok) return;
        mergedAnalysis = await response.json();
      }

      setAnalysis(mergedAnalysis);
      setAutoAnalyzing(false);
      updateToast("Updating document overview…");

      // ── Phase 2: synthesis on all merged drifts ──────────────────────────
      setSynthesisPending(true);
      const synthVersions = currentSnapshots.map((snap, i) => ({
        version: `V${i + 1}`,
        author_name: snap.createdByName,
        author_role: snap.createdByRole
      }));
      const synthResponse = await fetch("/api/analyze/synthesis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          template,
          versions: synthVersions,
          drifts: mergedAnalysis.drifts
        }),
        signal: controller.signal
      });
      if (controller.signal.aborted) return;
      if (synthResponse.ok) {
        const synthData = await synthResponse.json();
        setAnalysis((prev) => (prev ? { ...prev, ...synthData } : prev));
      }

      const doneLabel = isIncremental ? `${driftLabel} analyzed` : "Analysis complete";
      completeToast(doneLabel);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      // silently swallow auto-analysis errors — don't disrupt editing
    } finally {
      if (!controller.signal.aborted) {
        setAutoAnalyzing(false);
        setSynthesisPending(false);
      }
    }
  }

  function openToast(message: string) {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast((prev) => ({ message, done: false, mountKey: prev?.mountKey ?? Date.now() }));
  }

  function updateToast(message: string) {
    setToast((prev) => prev ? { ...prev, message } : { message, done: false, mountKey: Date.now() });
  }

  function completeToast(message: string) {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast((prev) => ({ message, done: true, mountKey: prev?.mountKey ?? Date.now() }));
    toastTimerRef.current = setTimeout(() => setToast(null), 2500);
  }

  function loadSnapshot(id: string) {
    const target = snapshots.find((snapshot) => snapshot.id === id);
    if (!target) return;
    const nextHtml = target.richContent ?? plainTextToHtml(target.content);
    setDraftHtml(nextHtml);
    setDraftPlainText(target.content);
  }

  function deleteSnapshot(id: string) {
    setSnapshots((prev) => prev.filter((snapshot) => snapshot.id !== id));
  }

  function analyzeSnapshots() {
    if (!canAnalyze) {
      setError("Save at least two snapshots before analysis.");
      return;
    }
    void analyze({
      title,
      template,
      versions: mapSnapshotsToVersions(snapshots)
    });
  }


  // Library view
  if (activeDocId === null) {
    return (
      <main className="mx-auto max-w-[1600px] px-4 py-6 md:px-8 md:py-10">
        <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="font-[var(--font-serif)] text-5xl leading-none md:text-6xl">Drift</h1>
            <p className="mt-2 max-w-md text-base text-ink/60">
              See how business plans, PRDs, and project docs evolve over time and who changed what.
            </p>
          </div>
        </header>

        {error ? (
          <div className="mb-4 rounded-lg bg-red-100 p-3 text-sm text-red-900">
            <p>{error}</p>
          </div>
        ) : null}

        <DocumentList
          documents={documents}
          demoCatalog={demoCatalog}
          loading={loading}
          onCreate={handleCreate}
          onOpen={openDocument}
          onDelete={handleDelete}
          onRunDemo={runDemo}
        />

        {loading ? (
          <div className="mt-4 text-center text-sm text-ink/60">Loading demo...</div>
        ) : null}
        {authorModalOpen ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4">
            <div className="w-full max-w-xl rounded-3xl border border-ink/10 bg-white p-6 shadow-2xl">
              <h2 className="font-[var(--font-serif)] text-3xl text-ink">Snapshot Identity</h2>
              <p className="mt-2 text-sm text-ink/60">Who is making this document change?</p>
              <div className="mt-5 grid gap-3">
                <label className="grid gap-1.5">
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate">Name</span>
                  <input
                    value={authorName}
                    onChange={(event) => setAuthorName(event.target.value)}
                    className="rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-ink/35"
                    placeholder="Perseus"
                  />
                </label>
                <label className="grid gap-1.5">
                  <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate">Role</span>
                  <input
                    value={authorRole}
                    onChange={(event) => setAuthorRole(event.target.value)}
                    className="rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-ink/35"
                    placeholder="Product Manager"
                  />
                </label>
              </div>
              <div className="mt-6 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setAuthorModalOpen(false)}
                  className="rounded-full border border-ink/20 bg-white px-4 py-2 text-sm font-semibold hover:bg-ink/5"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmSaveSnapshot}
                  className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-ink/90"
                >
                  Save Snapshot
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </main>
    );
  }

  // Document view
  return (
    <main className="mx-auto max-w-[1600px] px-4 py-6 md:px-8 md:py-10">
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-[var(--font-serif)] text-5xl leading-none md:text-6xl">Drift</h1>
          <p className="mt-2 max-w-md text-base text-ink/60">
            See how business plans, PRDs, and project docs evolve over time and who changed what.
          </p>
        </div>
        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={goToLibrary}
            className="rounded-full border border-ink/20 bg-white px-4 py-2 text-sm font-semibold hover:bg-ink/5"
          >
            &larr; Library
          </button>
        </div>
      </header>

      <div className="grid gap-4">
        {viewMode === "editor" ? (
          <EditorPanel
            title={title}
            template={template}
            draftHtml={draftHtml}
            draftPlainText={draftPlainText}
            snapshots={snapshots}
            loading={loading}
            analyzingMessage={analysisProgress}
            autoAnalyzing={autoAnalyzing}
            synthesisPending={synthesisPending}
            autoAnalyzeEnabled={autoAnalyzeEnabled}
            hasInsights={!!analysis}
            analysis={analysis}
            onTitleChange={setTitle}
            onTemplateChange={setTemplate}
            onDraftChange={(html, plainText) => {
              setDraftHtml(html);
              setDraftPlainText(plainText);
            }}
            onSaveSnapshot={saveSnapshot}
            onLoadSnapshot={loadSnapshot}
            onDeleteSnapshot={deleteSnapshot}
            onInsights={() => setViewMode("insights")}
            onBackToLibrary={goToLibrary}
            onReanalyze={() => { if (canAnalyze) void autoAnalyze(snapshots, true); }}
            onToggleAutoAnalyze={() => setAutoAnalyzeEnabled((v) => !v)}
            onClearAnalysis={() => {
              autoAnalysisAbortRef.current?.abort();
              setAnalysis(null);
              setAutoAnalyzing(false);
              setSynthesisPending(false);
            }}
          />
        ) : null}


        {error ? (
          <div className="rounded-lg bg-red-100 p-3 text-sm text-red-900">
            <p>{error}</p>
          </div>
        ) : null}

        {viewMode === "insights" && !analysis ? (
          <div className="mx-auto max-w-3xl animate-pulse space-y-5 py-6">
            <div className="space-y-3 py-6">
              <div className="h-3 w-24 rounded bg-ink/10" />
              <div className="h-7 w-3/4 rounded-lg bg-ink/10" />
              <div className="h-7 w-1/2 rounded-lg bg-ink/8" />
              <div className="flex gap-1 pt-1">
                {[1,2,3,4].map((d) => (
                  <span key={d} className="inline-block h-2.5 w-2.5 rounded-full bg-ink/15" />
                ))}
              </div>
            </div>
            <div className="rounded-3xl bg-ink/5 p-6 space-y-3">
              {[1,2,3,4,5].map((r) => (
                <div key={r} className="h-4 rounded bg-ink/8" style={{ width: `${90 - r * 8}%` }} />
              ))}
            </div>
            <div className="rounded-3xl bg-ink/5 p-6 space-y-3">
              <div className="h-4 w-1/3 rounded bg-ink/8" />
              <div className="h-4 w-full rounded bg-ink/8" />
              <div className="h-4 w-4/5 rounded bg-ink/8" />
            </div>
          </div>
        ) : null}

        {analysis && viewMode === "insights" ? (
          <AnalysisView
            title={title}
            analysis={analysis}
            snapshots={snapshots}
            synthesisPending={synthesisPending}
            onBack={() => setViewMode("editor")}
            onBackToLibrary={goToLibrary}
            transitionActors={transitionActors}
          />
        ) : null}
      </div>

      {/* ── Live status toast ── */}
      {toast ? (
        <div
          key={toast.mountKey}
          className={`pointer-events-none fixed bottom-6 left-1/2 z-50 ${
            toast.done ? "animate-toast-out" : "animate-toast-in"
          }`}
          style={{ transform: "translateX(-50%)" }}
        >
          <div className="flex items-center gap-2.5 rounded-full bg-ink px-4 py-2.5 shadow-lg">
            {toast.done ? (
              <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-olive text-[9px] font-bold text-white">
                ✓
              </span>
            ) : (
              <svg className="h-4 w-4 shrink-0 animate-spin text-white/60" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" strokeDasharray="28" strokeDashoffset="10" strokeLinecap="round" />
              </svg>
            )}
            <span className="text-sm font-semibold text-white">{toast.message}</span>
          </div>
        </div>
      ) : null}
      {authorModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 px-4">
          <div className="w-full max-w-xl rounded-3xl border border-ink/10 bg-white p-6 shadow-2xl">
            <h2 className="font-[var(--font-serif)] text-3xl text-ink">Snapshot Identity</h2>
            <p className="mt-2 text-sm text-ink/60">Who is making this document change?</p>
            <div className="mt-5 grid gap-3">
              <label className="grid gap-1.5">
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate">Name</span>
                <input
                  value={authorName}
                  onChange={(event) => setAuthorName(event.target.value)}
                  className="rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-ink/35"
                  placeholder="Perseus"
                />
              </label>
              <label className="grid gap-1.5">
                <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate">Role</span>
                <input
                  value={authorRole}
                  onChange={(event) => setAuthorRole(event.target.value)}
                  className="rounded-xl border border-ink/15 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-ink/35"
                  placeholder="Product Manager"
                />
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAuthorModalOpen(false)}
                className="rounded-full border border-ink/20 bg-white px-4 py-2 text-sm font-semibold hover:bg-ink/5"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmSaveSnapshot}
                className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-ink/90"
              >
                Save Snapshot
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function inferDemoPersona(
  input: VersionInput,
  index: number
): {
  id: string;
  name: string;
  role: string;
  handle: string;
  avatarUrl: string;
} {
  if (input.author_name) {
    const slug = input.author_name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
    const handle =
      input.author_handle?.trim() ||
      (slug ? `@${slug}` : `@demo-user-${index + 1}`);
    return {
      id: `demo-${slug || `user-${index + 1}`}`,
      name: input.author_name,
      role: input.author_role ?? "Editor",
      handle,
      avatarUrl:
        input.author_avatar_url ??
        `https://api.dicebear.com/9.x/notionists/svg?seed=${encodeURIComponent(input.author_name)}`
    };
  }

  const content = input.content;
  const ownerMatch = content.match(/draft owner:\s*([^\n]+)/i);
  if (ownerMatch?.[1]) {
    const owner = ownerMatch[1].trim().toLowerCase();
    if (owner.includes("sales legal")) {
      return {
        id: "demo-lena-kim",
        name: "Lena Kim",
        role: "Sales Counsel",
        handle: "@lena.legal",
        avatarUrl: "https://api.dicebear.com/9.x/notionists/svg?seed=Lena%20Kim"
      };
    }
    if (owner.includes("vendor counsel")) {
      return {
        id: "demo-marco-rossi",
        name: "Marco Rossi",
        role: "Vendor Counsel",
        handle: "@marco.vendor",
        avatarUrl: "https://api.dicebear.com/9.x/notionists/svg?seed=Marco%20Rossi"
      };
    }
    if (owner.includes("customer procurement")) {
      return {
        id: "demo-anya-patel",
        name: "Anya Patel",
        role: "Procurement Lead",
        handle: "@anya.procurement",
        avatarUrl: "https://api.dicebear.com/9.x/notionists/svg?seed=Anya%20Patel"
      };
    }
    if (owner.includes("joint redline")) {
      return {
        id: "demo-jordan-lee",
        name: "Jordan Lee",
        role: "Deal Desk Lead",
        handle: "@jordan.dealdesk",
        avatarUrl: "https://api.dicebear.com/9.x/notionists/svg?seed=Jordan%20Lee"
      };
    }
    // Series A Investment Memo personas
    if (owner.includes("investment analyst")) {
      return {
        id: "demo-priya-mehta",
        name: "Priya Mehta",
        role: "Investment Analyst",
        handle: "@priya.analyst",
        avatarUrl: "https://api.dicebear.com/9.x/notionists/svg?seed=Priya%20Mehta"
      };
    }
    if (owner.includes("due diligence counsel")) {
      return {
        id: "demo-nathan-cole",
        name: "Nathan Cole",
        role: "Due Diligence Counsel",
        handle: "@nathan.legal",
        avatarUrl: "https://api.dicebear.com/9.x/notionists/svg?seed=Nathan%20Cole"
      };
    }
    if (owner.includes("portfolio partner")) {
      return {
        id: "demo-claire-wu",
        name: "Claire Wu",
        role: "Portfolio Partner",
        handle: "@claire.partner",
        avatarUrl: "https://api.dicebear.com/9.x/notionists/svg?seed=Claire%20Wu"
      };
    }
    if (owner.includes("investment committee")) {
      return {
        id: "demo-richard-osei",
        name: "Richard Osei",
        role: "Investment Committee Chair",
        handle: "@richard.ic",
        avatarUrl: "https://api.dicebear.com/9.x/notionists/svg?seed=Richard%20Osei"
      };
    }
    // Platform API Deprecation PRD personas
    if (owner.includes("platform engineering")) {
      return {
        id: "demo-sam-novak",
        name: "Sam Novak",
        role: "Platform Engineering Lead",
        handle: "@sam.platform",
        avatarUrl: "https://api.dicebear.com/9.x/notionists/svg?seed=Sam%20Novak"
      };
    }
    if (owner.includes("customer success")) {
      return {
        id: "demo-tara-singh",
        name: "Tara Singh",
        role: "Customer Success Director",
        handle: "@tara.cs",
        avatarUrl: "https://api.dicebear.com/9.x/notionists/svg?seed=Tara%20Singh"
      };
    }
    if (owner.includes("product management")) {
      return {
        id: "demo-leo-martinez",
        name: "Leo Martinez",
        role: "Product Manager",
        handle: "@leo.product",
        avatarUrl: "https://api.dicebear.com/9.x/notionists/svg?seed=Leo%20Martinez"
      };
    }
    if (owner.includes("cto final")) {
      return {
        id: "demo-karen-liu",
        name: "Karen Liu",
        role: "Chief Technology Officer",
        handle: "@karen.cto",
        avatarUrl: "https://api.dicebear.com/9.x/notionists/svg?seed=Karen%20Liu"
      };
    }
    // Annual Budget Reallocation Memo personas
    if (owner.includes("chief financial officer")) {
      return {
        id: "demo-david-chen",
        name: "David Chen",
        role: "Chief Financial Officer",
        handle: "@david.cfo",
        avatarUrl: "https://api.dicebear.com/9.x/notionists/svg?seed=David%20Chen"
      };
    }
    if (owner.includes("chief technology officer")) {
      return {
        id: "demo-elena-volkov",
        name: "Elena Volkov",
        role: "Chief Technology Officer",
        handle: "@elena.cto",
        avatarUrl: "https://api.dicebear.com/9.x/notionists/svg?seed=Elena%20Volkov"
      };
    }
    if (owner.includes("vp of sales")) {
      return {
        id: "demo-marcus-james",
        name: "Marcus James",
        role: "VP of Sales",
        handle: "@marcus.sales",
        avatarUrl: "https://api.dicebear.com/9.x/notionists/svg?seed=Marcus%20James"
      };
    }
    if (owner.includes("ceo decision")) {
      return {
        id: "demo-sarah-park",
        name: "Sarah Park",
        role: "Chief Executive Officer",
        handle: "@sarah.ceo",
        avatarUrl: "https://api.dicebear.com/9.x/notionists/svg?seed=Sarah%20Park"
      };
    }
    // Post-Acquisition Integration Plan personas
    if (owner.includes("integration program")) {
      return {
        id: "demo-alex-turner",
        name: "Alex Turner",
        role: "Integration Program Manager",
        handle: "@alex.integration",
        avatarUrl: "https://api.dicebear.com/9.x/notionists/svg?seed=Alex%20Turner"
      };
    }
    if (owner.includes("vp of engineering")) {
      return {
        id: "demo-nina-petrova",
        name: "Nina Petrova",
        role: "VP of Engineering",
        handle: "@nina.eng",
        avatarUrl: "https://api.dicebear.com/9.x/notionists/svg?seed=Nina%20Petrova"
      };
    }
    if (owner.includes("chief people officer")) {
      return {
        id: "demo-james-okafor",
        name: "James Okafor",
        role: "Chief People Officer",
        handle: "@james.people",
        avatarUrl: "https://api.dicebear.com/9.x/notionists/svg?seed=James%20Okafor"
      };
    }
    if (owner.includes("ceo final")) {
      return {
        id: "demo-victoria-reyes",
        name: "Victoria Reyes",
        role: "Chief Executive Officer",
        handle: "@victoria.ceo",
        avatarUrl: "https://api.dicebear.com/9.x/notionists/svg?seed=Victoria%20Reyes"
      };
    }
  }

  const normalized = content.toLowerCase();
  const keywordToPersona: Array<{
    test: RegExp;
    id: string;
    name: string;
    role: string;
    handle: string;
    avatarUrl: string;
  }> = [
    {
      test: /\bfounder\b/,
      id: "demo-maya-chen",
      name: "Maya Chen",
      role: "Founder & CEO",
      handle: "@maya",
      avatarUrl: "https://api.dicebear.com/9.x/notionists/svg?seed=Maya%20Chen"
    },
    {
      test: /\bengineering\b/,
      id: "demo-daniel-park",
      name: "Daniel Park",
      role: "Engineering Lead",
      handle: "@daniel.eng",
      avatarUrl: "https://api.dicebear.com/9.x/notionists/svg?seed=Daniel%20Park"
    },
    {
      test: /\blegal\b|\bprivacy\b|\bcompliance\b/,
      id: "demo-rina-shah",
      name: "Rina Shah",
      role: "Privacy Counsel",
      handle: "@rina.legal",
      avatarUrl: "https://api.dicebear.com/9.x/notionists/svg?seed=Rina%20Shah"
    },
    {
      test: /\bgtm\b|\bgrowth\b|\bmarketing\b/,
      id: "demo-omar-garcia",
      name: "Omar Garcia",
      role: "Head of Growth",
      handle: "@omar.gtm",
      avatarUrl: "https://api.dicebear.com/9.x/notionists/svg?seed=Omar%20Garcia"
    },
    {
      test: /\bexec\b|\bexecutive\b/,
      id: "demo-ava-thompson",
      name: "Ava Thompson",
      role: "Chief Operating Officer",
      handle: "@ava.exec",
      avatarUrl: "https://api.dicebear.com/9.x/notionists/svg?seed=Ava%20Thompson"
    }
  ];

  const matched = keywordToPersona.find((rule) => rule.test.test(normalized));
  if (matched) {
    return {
      id: matched.id,
      name: matched.name,
      role: matched.role,
      handle: matched.handle,
      avatarUrl: matched.avatarUrl
    };
  }

  const fallback = [
    {
      id: "demo-maya-chen",
      name: "Maya Chen",
      role: "Founder & CEO",
      handle: "@maya",
      avatarUrl: "https://api.dicebear.com/9.x/notionists/svg?seed=Maya%20Chen"
    },
    {
      id: "demo-daniel-park",
      name: "Daniel Park",
      role: "Engineering Lead",
      handle: "@daniel.eng",
      avatarUrl: "https://api.dicebear.com/9.x/notionists/svg?seed=Daniel%20Park"
    },
    {
      id: "demo-rina-shah",
      name: "Rina Shah",
      role: "Privacy Counsel",
      handle: "@rina.legal",
      avatarUrl: "https://api.dicebear.com/9.x/notionists/svg?seed=Rina%20Shah"
    },
    {
      id: "demo-omar-garcia",
      name: "Omar Garcia",
      role: "Head of Growth",
      handle: "@omar.gtm",
      avatarUrl: "https://api.dicebear.com/9.x/notionists/svg?seed=Omar%20Garcia"
    },
    {
      id: "demo-ava-thompson",
      name: "Ava Thompson",
      role: "Chief Operating Officer",
      handle: "@ava.exec",
      avatarUrl: "https://api.dicebear.com/9.x/notionists/svg?seed=Ava%20Thompson"
    }
  ];
  const person = fallback[index % fallback.length];
  return {
    id: person.id,
    name: person.name,
    role: person.role,
    handle: person.handle,
    avatarUrl: person.avatarUrl
  };
}
