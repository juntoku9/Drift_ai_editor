"use client";

interface GoogleDocPanelProps {
  connected: boolean;
  docRef: string;
  loading: boolean;
  onRunDemo: () => void;
  onDocRefChange: (value: string) => void;
  onImport: () => void;
  onDisconnect: () => void;
}


export function GoogleDocPanel({
  connected,
  docRef,
  loading,
  onRunDemo,
  onDocRefChange,
  onImport,
  onDisconnect
}: GoogleDocPanelProps) {
  return (
    <section className="panel p-4 md:p-5">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate/80">
          Google Docs + Demo
        </p>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={onRunDemo}
            disabled={loading}
            className="rounded-full border border-ink/20 bg-ink px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Run Demo
          </button>
          {!connected ? (
            <a
              href="/api/google/auth"
              className="rounded-full bg-ink/90 px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90"
            >
              Connect Google
            </a>
          ) : (
            <button
              type="button"
              onClick={onDisconnect}
              className="rounded-full border border-ink/20 px-5 py-2.5 text-sm font-semibold hover:bg-ink/5"
            >
              Disconnect
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-[1fr_auto]">
        <input
          value={docRef}
          onChange={(event) => onDocRefChange(event.target.value)}
          className="w-full rounded-2xl border border-ink/15 bg-white px-5 py-3.5 text-sm outline-none ring-ember/40 focus:ring-2"
          placeholder="Paste Google Doc URL or Doc ID"
          disabled={!connected || loading}
        />
        <button
          type="button"
          onClick={onImport}
          disabled={!connected || loading || !docRef.trim()}
          className="rounded-2xl bg-olive px-5 py-3.5 text-sm font-semibold text-white hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? "Importing..." : "Import Revisions"}
        </button>
      </div>
      <p className="mt-3 text-xs text-ink/65">
        Connected: {connected ? "Yes" : "No"} | OAuth scopes: `drive.readonly`, `documents.readonly`.
      </p>
    </section>
  );
}
