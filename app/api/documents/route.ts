import { NextResponse } from "next/server";
import { desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { documents } from "@/lib/db/schema";
import type { DriftDocument, DocumentDigest } from "@/lib/types";

const DEMO_WORKSPACE_ID = "demo-workspace";

function isRecoverableDbError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return (
    message.includes("database_url") ||
    message.includes("failed to fetch") ||
    message.includes("fetch failed") ||
    message.includes("connect") ||
    message.includes("relation") ||
    message.includes("does not exist")
  );
}

function dbDisabledResponse() {
  return NextResponse.json(
    {
      error: "Database is not configured. Set DATABASE_URL to enable server-side document persistence."
    },
    { status: 503 }
  );
}

function toDigest(row: typeof documents.$inferSelect): DocumentDigest {
  return {
    id: row.id,
    title: row.title,
    template: row.template as DocumentDigest["template"],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    snapshotCount: (row.snapshots as unknown[])?.length ?? 0,
    driftScore: (row.analysis as { drift_score?: number } | null)?.drift_score ?? null,
    headline: (row.analysis as { headline?: string } | null)?.headline ?? null,
  };
}

// GET /api/documents — list all shared demo docs
export async function GET() {
  try {
    if (!process.env.DATABASE_URL) {
      return NextResponse.json([]);
    }
    const db = getDb();
    const rows = await db
      .select()
      .from(documents)
      .orderBy(desc(documents.updatedAt));
    return NextResponse.json(rows.map(toDigest));
  } catch (err) {
    console.error("[api.documents.GET] failed", err);
    if (isRecoverableDbError(err)) {
      return NextResponse.json([]);
    }
    const message = err instanceof Error ? err.message : "Failed to list documents";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST /api/documents — create a new shared demo document
export async function POST(request: Request) {
  try {
    if (!process.env.DATABASE_URL) {
      return dbDisabledResponse();
    }
    const body = (await request.json()) as DriftDocument;
    const db = getDb();
    const [row] = await db
      .insert(documents)
      .values({
        id: body.id,
        userId: DEMO_WORKSPACE_ID,
        title: body.title,
        template: body.template,
        draftHtml: body.draftHtml,
        draftPlainText: body.draftPlainText,
        snapshots: body.snapshots,
        analysis: body.analysis,
        createdAt: body.createdAt,
        updatedAt: body.updatedAt,
      })
      .returning();
    return NextResponse.json(row);
  } catch (err) {
    console.error("[api.documents.POST] failed", err);
    if (isRecoverableDbError(err)) {
      return NextResponse.json(
        { ok: true, persisted: false, warning: "Database unavailable; local-only mode active." },
        { status: 202 }
      );
    }
    const message = err instanceof Error ? err.message : "Failed to create document";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
