import { NextResponse } from "next/server";

import { clearGoogleTokens } from "@/lib/google/oauth";

export async function POST() {
  await clearGoogleTokens();
  return NextResponse.json({ ok: true });
}
