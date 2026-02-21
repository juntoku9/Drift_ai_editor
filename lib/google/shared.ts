export function extractGoogleDocId(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!trimmed.includes("http")) return trimmed;
  const match = trimmed.match(/\/document\/d\/([a-zA-Z0-9-_]+)/);
  return match?.[1] ?? null;
}
