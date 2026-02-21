"use client";

import type { VersionInput } from "@/lib/types";

interface InputPanelProps {
  title: string;
  versions: VersionInput[];
  loading: boolean;
  canAnalyze: boolean;
  onTitleChange: (value: string) => void;
  onVersionChange: (index: number, value: string) => void;
  onAddVersion: () => void;
  onRemoveVersion: (index: number) => void;
  onAnalyze: () => void;
}

export function InputPanel({
  title,
  versions,
  loading,
  canAnalyze,
  onTitleChange,
  onVersionChange,
  onAddVersion,
  onRemoveVersion,
  onAnalyze
}: InputPanelProps) {
  return (
    <section className="panel p-5 md:p-7">
      <div className="mb-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate/80">Input</p>
          <h2 className="font-[var(--font-serif)] text-2xl md:text-3xl">See how meaning moves.</h2>
        </div>
      </div>

      <div className="mb-5">
        <input
          value={title}
          onChange={(event) => onTitleChange(event.target.value)}
          className="w-full rounded-xl border border-ink/15 bg-white px-4 py-3 text-sm outline-none ring-ember/40 focus:ring-2"
          placeholder="Document title"
        />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {versions.map((item, index) => (
          <div key={item.version} className="rounded-xl border border-ink/10 bg-white p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold">{item.version}</p>
              {versions.length > 2 ? (
                <button
                  type="button"
                  className="text-xs text-ember underline-offset-2 hover:underline"
                  onClick={() => onRemoveVersion(index)}
                >
                  Remove
                </button>
              ) : null}
            </div>
            <textarea
              value={item.content}
              onChange={(event) => onVersionChange(index, event.target.value)}
              className="min-h-28 w-full resize-y rounded-lg border border-ink/10 p-3 text-sm outline-none ring-ember/40 focus:ring-2"
              placeholder={`Paste ${item.version} text...`}
            />
          </div>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={onAddVersion}
          disabled={versions.length >= 10 || loading}
          className="rounded-full border border-ink/20 px-4 py-2 text-sm font-medium hover:bg-ink/5 disabled:cursor-not-allowed disabled:opacity-50"
        >
          + Add Version
        </button>
        <button
          type="button"
          onClick={onAnalyze}
          disabled={loading || !canAnalyze}
          className="rounded-full bg-ember px-5 py-2 text-sm font-semibold text-white hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Analyzing..." : "Analyze Drift"}
        </button>
      </div>
    </section>
  );
}
