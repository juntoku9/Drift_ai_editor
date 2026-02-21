import { NextResponse } from "next/server";

import { getGoogleAccessToken } from "@/lib/google/oauth";

export async function GET() {
  const token = await getGoogleAccessToken();
  return NextResponse.json({ connected: Boolean(token) });
}
