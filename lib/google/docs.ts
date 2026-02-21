import type { VersionInput } from "@/lib/types";

const GOOGLE_DRIVE_BASE = "https://www.googleapis.com/drive/v3";
const GOOGLE_DOCS_BASE = "https://docs.googleapis.com/v1";

interface DriveRevision {
  id: string;
  modifiedTime?: string;
}

export interface RevisionExportAttempt {
  revisionId: string;
  modifiedTime?: string;
  exportStatus: "ok" | "http_error" | "empty_text" | "too_short";
  httpStatus?: number;
  textLength?: number;
  errorMessage?: string;
}

export interface RevisionImportDiagnostics {
  fileId: string;
  requestedLimit: number;
  revisionsFound: number;
  successfulRevisionTexts: number;
  fallbackUsed: boolean;
  fallbackCurrentDocTextLength?: number;
  attempts: RevisionExportAttempt[];
}

export class GoogleRevisionImportError extends Error {
  diagnostics: RevisionImportDiagnostics;

  constructor(message: string, diagnostics: RevisionImportDiagnostics) {
    super(message);
    this.name = "GoogleRevisionImportError";
    this.diagnostics = diagnostics;
  }
}

function authHeaders(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}` };
}

async function listRevisions(fileId: string, token: string, limit: number): Promise<DriveRevision[]> {
  const params = new URLSearchParams({
    pageSize: String(limit),
    fields: "revisions(id,modifiedTime)",
    orderBy: "modifiedTime"
  });
  const url = `${GOOGLE_DRIVE_BASE}/files/${fileId}/revisions?${params.toString()}`;
  const response = await fetch(url, { headers: authHeaders(token), cache: "no-store" });
  const data = (await response.json()) as {
    revisions?: DriveRevision[];
    error?: { message?: string };
  };
  if (!response.ok) {
    throw new Error(data.error?.message ?? "Unable to list revisions.");
  }
  return data.revisions ?? [];
}

async function exportRevisionText(
  fileId: string,
  revisionId: string,
  token: string
): Promise<{ text: string | null; httpStatus: number; errorMessage?: string }> {
  const params = new URLSearchParams({ mimeType: "text/plain" });
  const url = `${GOOGLE_DRIVE_BASE}/files/${fileId}/revisions/${revisionId}/export?${params.toString()}`;
  const response = await fetch(url, { headers: authHeaders(token), cache: "no-store" });
  if (!response.ok) {
    let errorMessage: string | undefined;
    try {
      const data = (await response.json()) as { error?: { message?: string } };
      errorMessage = data.error?.message;
    } catch {
      errorMessage = undefined;
    }
    return { text: null, httpStatus: response.status, errorMessage };
  }
  const text = await response.text();
  const cleaned = text.trim();
  return { text: cleaned.length ? cleaned : null, httpStatus: response.status };
}

function parseDocumentText(doc: unknown): string {
  const body = (doc as { body?: { content?: Array<{ paragraph?: { elements?: Array<{ textRun?: { content?: string } }> } }> } })
    .body;
  const parts: string[] = [];
  for (const block of body?.content ?? []) {
    const elements = block.paragraph?.elements ?? [];
    for (const el of elements) {
      const text = el.textRun?.content;
      if (text) parts.push(text);
    }
  }
  return parts.join("").replace(/\n{3,}/g, "\n\n").trim();
}

async function fetchCurrentDocText(fileId: string, token: string): Promise<string> {
  const response = await fetch(`${GOOGLE_DOCS_BASE}/documents/${fileId}`, {
    headers: authHeaders(token),
    cache: "no-store"
  });
  const data = (await response.json()) as { error?: { message?: string } };
  if (!response.ok) {
    throw new Error(data.error?.message ?? "Unable to fetch document content.");
  }
  return parseDocumentText(data);
}

export async function fetchDocRevisionsAsVersions(args: {
  fileId: string;
  token: string;
  limit?: number;
}): Promise<VersionInput[]> {
  const limit = Math.max(2, Math.min(args.limit ?? 6, 10));
  const revisions = await listRevisions(args.fileId, args.token, limit);
  const revisionTexts: VersionInput[] = [];
  const diagnostics: RevisionImportDiagnostics = {
    fileId: args.fileId,
    requestedLimit: limit,
    revisionsFound: revisions.length,
    successfulRevisionTexts: 0,
    fallbackUsed: false,
    attempts: []
  };

  for (const revision of revisions) {
    const exported = await exportRevisionText(args.fileId, revision.id, args.token);
    if (exported.httpStatus < 200 || exported.httpStatus >= 300) {
      diagnostics.attempts.push({
        revisionId: revision.id,
        modifiedTime: revision.modifiedTime,
        exportStatus: "http_error",
        httpStatus: exported.httpStatus,
        errorMessage: exported.errorMessage
      });
      continue;
    }
    if (!exported.text) {
      diagnostics.attempts.push({
        revisionId: revision.id,
        modifiedTime: revision.modifiedTime,
        exportStatus: "empty_text",
        httpStatus: exported.httpStatus,
        textLength: 0
      });
      continue;
    }
    if (exported.text.length < 20) {
      diagnostics.attempts.push({
        revisionId: revision.id,
        modifiedTime: revision.modifiedTime,
        exportStatus: "too_short",
        httpStatus: exported.httpStatus,
        textLength: exported.text.length
      });
      continue;
    }

    diagnostics.attempts.push({
      revisionId: revision.id,
      modifiedTime: revision.modifiedTime,
      exportStatus: "ok",
      httpStatus: exported.httpStatus,
      textLength: exported.text.length
    });

    revisionTexts.push({
      version: `V${revisionTexts.length + 1}`,
      timestamp: revision.modifiedTime,
      content: exported.text
    });
  }

  diagnostics.successfulRevisionTexts = revisionTexts.length;
  if (revisionTexts.length >= 2) return revisionTexts;

  // Fallback to current content if revision export is unavailable for this doc.
  const currentText = await fetchCurrentDocText(args.fileId, args.token);
  diagnostics.fallbackUsed = true;
  diagnostics.fallbackCurrentDocTextLength = currentText.length;

  if (currentText.length < 20) {
    throw new GoogleRevisionImportError("Document text is empty or too short for analysis.", diagnostics);
  }

  if (revisionTexts.length === 1) {
    return [
      revisionTexts[0],
      {
        version: "V2",
        timestamp: new Date().toISOString(),
        content: currentText
      }
    ];
  }

  throw new GoogleRevisionImportError(
    "Could not export enough revision text for this Google Doc. Need at least 2 usable versions.",
    diagnostics
  );
}
