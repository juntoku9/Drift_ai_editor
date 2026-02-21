import { NextResponse } from "next/server";

import {
  clearGoogleStateCookie,
  exchangeCodeForToken,
  getGoogleStateCookie,
  setGoogleTokens
} from "@/lib/google/oauth";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(new URL(`/?google=error&reason=${encodeURIComponent(error)}`, url.origin));
  }

  if (!code || !state) {
    return NextResponse.redirect(new URL("/?google=error&reason=missing_code", url.origin));
  }

  try {
    const savedState = await getGoogleStateCookie();
    await clearGoogleStateCookie();
    if (!savedState || savedState !== state) {
      return NextResponse.redirect(new URL("/?google=error&reason=invalid_state", url.origin));
    }

    const token = await exchangeCodeForToken({ code, origin: url.origin });
    await setGoogleTokens(token.access_token, token.expires_in, token.refresh_token);
    return NextResponse.redirect(new URL("/?google=connected", url.origin));
  } catch (err) {
    const reason = err instanceof Error ? err.message : "token_exchange_failed";
    return NextResponse.redirect(
      new URL(`/?google=error&reason=${encodeURIComponent(reason)}`, url.origin)
    );
  }
}
