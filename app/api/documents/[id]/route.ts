import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { documents } from "@/lib/db/schema";
import type { DriftDocument } from "@/lib/types";

function dbDisabledResponse() {
  return NextResponse.json(
    {
      error: "Database is not configured. Set DATABASE_URL to enable server-side document persistence."
    },
    { status: 503 }
  );
}

// HEAD /api/documents/[id] — existence check used by the store upsert logic
export async function HEAD(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!process.env.DATABASE_URL) return new NextResponse(null, { status: 404 });
    const { id } = await params;
    const db = getDb();
    const [row] = await db
      .select({ id: documents.id })
      .from(documents)
      .where(eq(documents.id, id))
      .limit(1);
    return new NextResponse(null, { status: row ? 200 : 404 });
  } catch {
    return new NextResponse(null, { status: 500 });
  }
}

// GET /api/documents/[id]
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!process.env.DATABASE_URL) return dbDisabledResponse();
    const { id } = await params;
    const db = getDb();
    const [row] = await db
      .select()
      .from(documents)
      .where(eq(documents.id, id))
      .limit(1);
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(row);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load document";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// PUT /api/documents/[id]
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!process.env.DATABASE_URL) return dbDisabledResponse();
    const { id } = await params;
    const body = (await request.json()) as DriftDocument;
    const db = getDb();
    const [row] = await db
      .update(documents)
      .set({
        title: body.title,
        template: body.template,
        draftHtml: body.draftHtml,
        draftPlainText: body.draftPlainText,
        snapshots: body.snapshots,
        analysis: body.analysis,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(documents.id, id))
      .returning();
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(row);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to save document";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE /api/documents/[id]
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!process.env.DATABASE_URL) return new NextResponse(null, { status: 204 });
    const { id } = await params;
    const db = getDb();
    await db
      .delete(documents)
      .where(eq(documents.id, id));
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to delete document";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
