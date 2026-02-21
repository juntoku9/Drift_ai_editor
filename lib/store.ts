import type { DriftDocument, DocumentDigest, DomainTemplate, EditorSnapshot } from "@/lib/types";
import { plainTextToHtml } from "@/lib/rich-text";

const INDEX_KEY = "drift-doc-index";
const DOC_PREFIX = "drift-doc:";
const V1_KEY = "drift-editor-state-v1";

function docKey(id: string): string {
  return `${DOC_PREFIX}${id}`;
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

export function listDocuments(): DocumentDigest[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as DocumentDigest[];
  } catch {
    return [];
  }
}

export function loadDocument(id: string): DriftDocument | null {
  try {
    const raw = localStorage.getItem(docKey(id));
    if (!raw) return null;
    return JSON.parse(raw) as DriftDocument;
  } catch {
    return null;
  }
}

export function saveDocument(doc: DriftDocument): void {
  doc.updatedAt = new Date().toISOString();
  localStorage.setItem(docKey(doc.id), JSON.stringify(doc));

  const index = listDocuments();
  const digest = toDigest(doc);
  const existing = index.findIndex((d) => d.id === doc.id);
  if (existing >= 0) {
    index[existing] = digest;
  } else {
    index.unshift(digest);
  }
  localStorage.setItem(INDEX_KEY, JSON.stringify(index));
}

export function deleteDocument(id: string): void {
  localStorage.removeItem(docKey(id));
  const index = listDocuments().filter((d) => d.id !== id);
  localStorage.setItem(INDEX_KEY, JSON.stringify(index));
}

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

export function migrateFromV1(): DriftDocument | null {
  try {
    const raw = localStorage.getItem(V1_KEY);
    if (!raw) return null;
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

    saveDocument(doc);
    localStorage.removeItem(V1_KEY);
    return doc;
  } catch {
    return null;
  }
}
