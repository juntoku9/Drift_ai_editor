import { cookies } from "next/headers";

const GOOGLE_AUTH_BASE = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

export const GOOGLE_ACCESS_COOKIE = "google_access_token";
export const GOOGLE_REFRESH_COOKIE = "google_refresh_token";
export const GOOGLE_STATE_COOKIE = "google_oauth_state";
const IS_PROD = process.env.NODE_ENV === "production";

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export function getGoogleClientId(): string {
  return requiredEnv("GOOGLE_CLIENT_ID");
}

export function getGoogleClientSecret(): string {
  return requiredEnv("GOOGLE_CLIENT_SECRET");
}

export function getGoogleRedirectUri(origin?: string): string {
  if (process.env.GOOGLE_REDIRECT_URI) {
    return process.env.GOOGLE_REDIRECT_URI;
  }
  if (!origin) {
    throw new Error("Missing GOOGLE_REDIRECT_URI and request origin.");
  }
  return `${origin}/api/google/callback`;
}

export async function setGoogleStateCookie(state: string): Promise<void> {
  const store = await cookies();
  store.set(GOOGLE_STATE_COOKIE, state, {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: "lax",
    maxAge: 10 * 60,
    path: "/"
  });
}

export async function getGoogleStateCookie(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(GOOGLE_STATE_COOKIE)?.value;
}

export async function clearGoogleStateCookie(): Promise<void> {
  const store = await cookies();
  store.set(GOOGLE_STATE_COOKIE, "", {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: "lax",
    maxAge: 0,
    path: "/"
  });
}

export async function setGoogleTokens(
  accessToken: string,
  expiresIn: number,
  refreshToken?: string
): Promise<void> {
  const store = await cookies();
  store.set(GOOGLE_ACCESS_COOKIE, accessToken, {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: "lax",
    maxAge: Math.max(60, expiresIn - 60),
    path: "/"
  });
  if (refreshToken) {
    store.set(GOOGLE_REFRESH_COOKIE, refreshToken, {
      httpOnly: true,
      secure: IS_PROD,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30,
      path: "/"
    });
  }
}

export async function getGoogleAccessToken(): Promise<string | undefined> {
  const store = await cookies();
  return store.get(GOOGLE_ACCESS_COOKIE)?.value;
}

export async function clearGoogleTokens(): Promise<void> {
  const store = await cookies();
  for (const cookieName of [GOOGLE_ACCESS_COOKIE, GOOGLE_REFRESH_COOKIE]) {
    store.set(cookieName, "", {
      httpOnly: true,
      secure: IS_PROD,
      sameSite: "lax",
      maxAge: 0,
      path: "/"
    });
  }
}

export function buildGoogleAuthUrl(origin: string, state: string): string {
  const clientId = getGoogleClientId();
  const redirectUri = getGoogleRedirectUri(origin);
  // OAuth-only flow for revision access across the user's docs.
  const scopes = [
    "https://www.googleapis.com/auth/drive.readonly",
    "https://www.googleapis.com/auth/documents.readonly"
  ].join(" ");
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: scopes,
    access_type: "offline",
    include_granted_scopes: "true",
    prompt: "consent",
    state
  });
  return `${GOOGLE_AUTH_BASE}?${params.toString()}`;
}

export async function exchangeCodeForToken(args: {
  code: string;
  origin: string;
}): Promise<{ access_token: string; expires_in: number; refresh_token?: string }> {
  const payload = new URLSearchParams({
    code: args.code,
    client_id: getGoogleClientId(),
    client_secret: getGoogleClientSecret(),
    redirect_uri: getGoogleRedirectUri(args.origin),
    grant_type: "authorization_code"
  });
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: payload.toString(),
    cache: "no-store"
  });
  const data = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
    refresh_token?: string;
    error?: string;
    error_description?: string;
  };
  if (!response.ok || !data.access_token || !data.expires_in) {
    const detail = data.error_description ?? data.error ?? "Unknown OAuth token error.";
    throw new Error(`Google token exchange failed: ${detail}`);
  }
  return {
    access_token: data.access_token,
    expires_in: data.expires_in,
    refresh_token: data.refresh_token
  };
}

export function createOauthState(): string {
  return crypto.randomUUID();
}
