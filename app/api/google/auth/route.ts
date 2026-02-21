import { NextResponse } from "next/server";

import { buildGoogleAuthUrl, createOauthState, setGoogleStateCookie } from "@/lib/google/oauth";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const origin = url.origin;
    const state = createOauthState();
    await setGoogleStateCookie(state);
    const authUrl = buildGoogleAuthUrl(origin, state);
    return NextResponse.redirect(authUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google auth init failed.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
