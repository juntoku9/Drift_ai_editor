import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { eq, and } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { documents } from "@/lib/db/schema";
import type { DriftDocument } from "@/lib/types";

const clerkAuthEnabled = Boolean(
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY && process.env.CLERK_SECRET_KEY
);

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

// HEAD /api/documents/[id] — existence check used by the store upsert logic
export async function HEAD(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!process.env.DATABASE_URL) return new NextResponse(null, { status: 404 });
    const userId = await getUserIdOrNull();
    if (!userId) return new NextResponse(null, { status: 401 });
    const { id } = await params;
    const db = getDb();
    const [row] = await db
      .select({ id: documents.id })
      .from(documents)
      .where(and(eq(documents.id, id), eq(documents.userId, userId)))
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
    const userId = await getUserIdOrNull();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    const db = getDb();
    const [row] = await db
      .select()
      .from(documents)
      .where(and(eq(documents.id, id), eq(documents.userId, userId)))
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
    const userId = await getUserIdOrNull();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
      .where(and(eq(documents.id, id), eq(documents.userId, userId)))
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
    const userId = await getUserIdOrNull();
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await params;
    const db = getDb();
    await db
      .delete(documents)
      .where(and(eq(documents.id, id), eq(documents.userId, userId)));
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to delete document";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
