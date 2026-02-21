import { NextResponse } from "next/server";

import { fetchDocRevisionsAsVersions, GoogleRevisionImportError } from "@/lib/google/docs";
import { getGoogleAccessToken } from "@/lib/google/oauth";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = await getGoogleAccessToken();
    if (!token) {
      return NextResponse.json(
        { error: "Google is not connected. Connect first." },
        { status: 401 }
      );
    }

    const { id } = await params;
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") ?? "6");
    const versions = await fetchDocRevisionsAsVersions({ fileId: id, token, limit });
    return NextResponse.json({ title: "Google Doc", versions });
  } catch (error) {
    if (error instanceof GoogleRevisionImportError) {
      console.error("Google revision import failed", error.diagnostics);
      return NextResponse.json(
        {
          error: error.message,
          details: error.diagnostics
        },
        { status: 422 }
      );
    }
    const message = error instanceof Error ? error.message : "Failed to fetch revisions.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
