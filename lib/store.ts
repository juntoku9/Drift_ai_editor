import type { DriftDocument, DocumentDigest, DomainTemplate, EditorSnapshot } from "@/lib/types";
import { plainTextToHtml } from "@/lib/rich-text";

// ── localStorage helpers (always available, used as fallback) ─────────────────

const INDEX_KEY = "drift-doc-index";
const DOC_PREFIX = "drift-doc:";
const V1_KEY = "drift-editor-state-v1";
let remotePersistenceAvailable: "unknown" | "enabled" | "disabled" =
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ? "unknown" : "disabled";

function docKey(id: string) { return `${DOC_PREFIX}${id}`; }

function shouldUseRemotePersistence(): boolean {
  return remotePersistenceAvailable !== "disabled";
}

function markRemotePersistenceFromStatus(status: number): void {
  if (status === 401 || status === 403) {
    remotePersistenceAvailable = "disabled";
    return;
  }
  if (status >= 200 && status < 300) {
    remotePersistenceAvailable = "enabled";
  }
}

function toDigest(doc: DriftDocument): DocumentDigest {
  return {
    id: doc.id,
    title: doc.title,
    template: doc.template,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    snapshotCount: doc.snapshots.length,
    driftScore: doc.analysis?.drift_score ?? null,
    headline: doc.analysis?.headline ?? null,
  };
}

function localList(): DocumentDigest[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    return raw ? (JSON.parse(raw) as DocumentDigest[]) : [];
  } catch { return []; }
}

function localLoad(id: string): DriftDocument | null {
  try {
    const raw = localStorage.getItem(docKey(id));
    return raw ? (JSON.parse(raw) as DriftDocument) : null;
  } catch { return null; }
}

function localSave(doc: DriftDocument): void {
  const updated = { ...doc, updatedAt: new Date().toISOString() };
  localStorage.setItem(docKey(updated.id), JSON.stringify(updated));
  const index = localList();
  const digest = toDigest(updated);
  const i = index.findIndex((d) => d.id === updated.id);
  if (i >= 0) index[i] = digest; else index.unshift(digest);
  localStorage.setItem(INDEX_KEY, JSON.stringify(index));
}

function localDelete(id: string): void {
  localStorage.removeItem(docKey(id));
  localStorage.setItem(INDEX_KEY, JSON.stringify(localList().filter((d) => d.id !== id)));
}

// ── createDocument (always sync — just builds the default object) ─────────────

export function createDocument(partial?: Partial<DriftDocument>): DriftDocument {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    title: "Untitled Document",
    template: "product_spec" as DomainTemplate,
    createdAt: now,
    updatedAt: now,
    draftHtml: "<p></p>",
    draftPlainText: "",
    snapshots: [],
    analysis: null,
    ...partial,
  };
}

// ── Async API-backed store (falls back to localStorage on any error / 401) ────

export async function listDocuments(): Promise<DocumentDigest[]> {
  if (!shouldUseRemotePersistence()) return localList();
  try {
    const res = await fetch("/api/documents");
    markRemotePersistenceFromStatus(res.status);
    if (!res.ok) return localList();
    return res.json() as Promise<DocumentDigest[]>;
  } catch { return localList(); }
}

export async function loadDocument(id: string): Promise<DriftDocument | null> {
  if (!shouldUseRemotePersistence()) return localLoad(id);
  try {
    const res = await fetch(`/api/documents/${id}`);
    markRemotePersistenceFromStatus(res.status);
    if (!res.ok) return localLoad(id);
    return res.json() as Promise<DriftDocument>;
  } catch { return localLoad(id); }
}

export async function saveDocument(doc: DriftDocument): Promise<void> {
  // Always write to localStorage immediately (instant, no flicker on reload)
  localSave(doc);
  if (!shouldUseRemotePersistence()) return;
  // Then persist to DB (best-effort — unauthenticated users just stay on localStorage)
  try {
    const exists = await fetch(`/api/documents/${doc.id}`, { method: "HEAD" });
    markRemotePersistenceFromStatus(exists.status);
    if (exists.status === 401 || exists.status === 403) return;
    if (exists.status === 404) {
      await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(doc),
      });
    } else if (exists.ok) {
      await fetch(`/api/documents/${doc.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(doc),
      });
    }
    // 401 = not authenticated → localStorage-only, silently skip
  } catch { /* network error — localStorage already has the data */ }
}

export async function deleteDocument(id: string): Promise<void> {
  localDelete(id);
  if (!shouldUseRemotePersistence()) return;
  try {
    const res = await fetch(`/api/documents/${id}`, { method: "DELETE" });
    markRemotePersistenceFromStatus(res.status);
  } catch { /* best-effort */ }
}

// ── V1 migration (localStorage-only, one-time) ────────────────────────────────

export function migrateFromV1(): void {
  try {
    const raw = localStorage.getItem(V1_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as {
      title?: string;
      template?: DomainTemplate;
      draft?: string;
      draftHtml?: string;
      draftPlainText?: string;
      snapshots?: EditorSnapshot[];
    };
    let draftHtml = parsed.draftHtml ?? "<p></p>";
    let draftPlainText = parsed.draftPlainText ?? "";
    if (parsed.draft && !parsed.draftHtml) {
      draftHtml = plainTextToHtml(parsed.draft);
      draftPlainText = parsed.draft;
    }
    const doc = createDocument({
      title: parsed.title || "Untitled Document",
      template: parsed.template || "product_spec",
      draftHtml,
      draftPlainText,
      snapshots: parsed.snapshots ?? [],
    });
    localSave(doc);
    localStorage.removeItem(V1_KEY);
  } catch { /* ignore */ }
}
