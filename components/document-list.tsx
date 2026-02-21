"use client";

import { useState } from "react";

import { getTemplateLabel } from "@/lib/templates";
import type { DocumentDigest } from "@/lib/types";

interface DocumentListProps {
  documents: DocumentDigest[];
  demoCatalog: Array<{ id: string; name: string }>;
  loading?: boolean;
  onCreate: () => void;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onRunDemo: (id: string) => void;
}

function severityDots(score: number): { filled: number; label: string; color: string } {
  if (score >= 66) return { filled: 4, label: "High drift", color: "bg-ember" };
  if (score >= 36) return { filled: 3, label: "Moderate drift", color: "bg-amber-500" };
  return { filled: 2, label: "Low drift", color: "bg-olive" };
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

/* ── New-document modal ─────────────────────────────────── */

function NewDocModal({
  demoCatalog,
  loading,
  onCreate,
  onRunDemo,
  onClose,
}: {
  demoCatalog: Array<{ id: string; name: string }>;
  loading?: boolean;
  onCreate: () => void;
  onRunDemo: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="panel w-full max-w-md p-6 md:p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate/80">
          New Document
        </p>

        <button
          type="button"
          onClick={() => { onCreate(); onClose(); }}
          className="mt-4 w-full rounded-2xl border border-ink/10 p-4 text-left transition hover:bg-ink/[0.03]"
        >
          <p className="text-sm font-semibold">Blank document</p>
          <p className="mt-0.5 text-xs text-ink/50">Start from scratch</p>
        </button>

        {demoCatalog.length > 0 && (
          <>
            <div className="my-4 flex items-center gap-3">
              <div className="h-px flex-1 bg-ink/10" />
              <span className="text-[10px] font-medium uppercase tracking-[0.1em] text-ink/35">or load a demo</span>
              <div className="h-px flex-1 bg-ink/10" />
            </div>
            <div className="space-y-1.5">
              {demoCatalog.map((scenario) => (
                <button
                  key={scenario.id}
                  type="button"
                  disabled={loading}
                  onClick={() => { onRunDemo(scenario.id); onClose(); }}
                  className="w-full rounded-xl border border-ink/10 px-4 py-3 text-left text-sm font-medium transition hover:bg-ink/[0.03] disabled:opacity-50"
                >
                  {scenario.name}
                </button>
              ))}
            </div>
          </>
        )}

        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full text-center text-xs font-medium text-ink/40 hover:text-ink/60"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/* ── Document list ──────────────────────────────────────── */

export function DocumentList({
  documents,
  demoCatalog,
  loading,
  onCreate,
  onOpen,
  onDelete,
  onRunDemo,
}: DocumentListProps) {
  const [showModal, setShowModal] = useState(false);

  if (documents.length === 0) {
    return (
      <>
        <div className="panel mx-auto max-w-xl p-8 text-center">
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate/80">
            Your Library
          </p>
          <h2 className="mb-3 font-[var(--font-serif)] text-2xl">No documents yet</h2>
          <p className="mb-6 text-sm text-ink/60">
            Create a new document or load a demo to see how drift analysis works.
          </p>
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="rounded-full bg-ink px-6 py-2.5 text-sm font-semibold text-white hover:opacity-90"
          >
            + New Document
          </button>
        </div>
        {showModal && (
          <NewDocModal
            demoCatalog={demoCatalog}
            loading={loading}
            onCreate={onCreate}
            onRunDemo={onRunDemo}
            onClose={() => setShowModal(false)}
          />
        )}
      </>
    );
  }

  return (
    <>
      <div>
        <div className="mb-5 flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate/80">
            Your Library
          </p>
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90"
          >
            + New
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {documents.map((doc) => {
            const severity = doc.driftScore != null ? severityDots(doc.driftScore) : null;
            return (
              <button
                key={doc.id}
                type="button"
                onClick={() => onOpen(doc.id)}
                className="panel group relative p-5 text-left transition-shadow hover:shadow-[0_8px_30px_rgba(18,20,24,0.10)]"
              >
                <div className="mb-2 flex items-start justify-between gap-2">
                  <h3 className="font-[var(--font-serif)] text-lg leading-snug line-clamp-2">
                    {doc.title}
                  </h3>
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(doc.id);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.stopPropagation();
                        onDelete(doc.id);
                      }
                    }}
                    className="shrink-0 text-xs text-ink/30 opacity-0 transition-opacity hover:text-ember group-hover:opacity-100"
                  >
                    Delete
                  </span>
                </div>

                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-ink/5 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-ink/60">
                    {getTemplateLabel(doc.template)}
                  </span>
                  <span className="text-[11px] text-ink/50">
                    {doc.snapshotCount} snapshot{doc.snapshotCount !== 1 ? "s" : ""}
                  </span>
                </div>

                {severity ? (
                  <div className="mb-2 flex items-center gap-1.5">
                    <div className="flex gap-0.5">
                      {[1, 2, 3, 4].map((dot) => (
                        <span
                          key={dot}
                          className={`inline-block h-2 w-2 rounded-full ${
                            dot <= severity.filled ? severity.color : "bg-ink/15"
                          }`}
                        />
                      ))}
                    </div>
                    <span className="text-[11px] text-ink/55">{severity.label}</span>
                  </div>
                ) : null}

                {doc.headline ? (
                  <p className="mb-2 line-clamp-2 text-sm leading-relaxed text-ink/70">
                    {doc.headline}
                  </p>
                ) : null}

                <p className="text-[11px] text-ink/40">{relativeTime(doc.updatedAt)}</p>
              </button>
            );
          })}
        </div>
      </div>
      {showModal && (
        <NewDocModal
          demoCatalog={demoCatalog}
          loading={loading}
          onCreate={onCreate}
          onRunDemo={onRunDemo}
          onClose={() => setShowModal(false)}
        />
      )}
    </>
  );
}
