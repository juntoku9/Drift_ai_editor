import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { eq, desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { documents } from "@/lib/db/schema";
import type { DriftDocument, DocumentDigest } from "@/lib/types";

const clerkAuthEnabled = Boolean(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY
);

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

function isMissingClerkMiddlewareError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return (
    message.includes("auth() was called") &&
    message.includes("clerkmiddleware")
  );
}

async function getUserIdOrNull(): Promise<string | null> {
  if (!clerkAuthEnabled) return null;
  try {
    const { userId } = await auth();
    return userId ?? null;
  } catch (error) {
    if (isMissingClerkMiddlewareError(error)) {
      return null;
    }
    throw error;
  }
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

// GET /api/documents — list all docs for the authenticated user
export async function GET() {
  try {
    if (!process.env.DATABASE_URL) {
      // Local-only mode: client store will use localStorage fallback.
      return NextResponse.json([]);
    }
    const userId = await getUserIdOrNull();
    if (!userId) {
      // Keep local-mode UX clean when auth is disabled/misconfigured.
      return NextResponse.json([]);
    }
    const db = getDb();
    const rows = await db
      .select()
      .from(documents)
      .where(eq(documents.userId, userId))
      .orderBy(desc(documents.updatedAt));
    return NextResponse.json(rows.map(toDigest));
  } catch (err) {
    console.error("[api.documents.GET] failed", err);
    if (isRecoverableDbError(err)) {
      // Local-only fallback path: keep app usable without DB/migrations.
      return NextResponse.json([]);
    }
    const message = err instanceof Error ? err.message : "Failed to list documents";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST /api/documents — create a new document
export async function POST(request: Request) {
  try {
    if (!process.env.DATABASE_URL) {
      return dbDisabledResponse();
    }
    const userId = await getUserIdOrNull();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const body = (await request.json()) as DriftDocument;
    const db = getDb();
    const [row] = await db
      .insert(documents)
      .values({
        id: body.id,
        userId,
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
