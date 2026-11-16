// Display name for a game-type code, where the UI would otherwise print the raw
// code (often with CSS `capitalize`). Only the codes whose product name differs
// from the code are mapped: `tracks` is the "Track" game. Unknown codes pass through.
const RENAMED: Record<string, string> = { tracks: 'Track' };

export function displayGameType(code: string | null | undefined): string {
  if (!code) return '';
  return RENAMED[code.toLowerCase()] ?? code;
}
