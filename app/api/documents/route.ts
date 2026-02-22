import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { eq, desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { documents } from "@/lib/db/schema";
import type { DriftDocument, DocumentDigest } from "@/lib/types";

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
    const { userId } = await auth();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const db = getDb();
    const rows = await db
      .select()
      .from(documents)
      .where(eq(documents.userId, userId))
      .orderBy(desc(documents.updatedAt));
    return NextResponse.json(rows.map(toDigest));
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to list documents";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// POST /api/documents — create a new document
export async function POST(request: Request) {
  try {
    const { userId } = await auth();
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
    const message = err instanceof Error ? err.message : "Failed to create document";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
