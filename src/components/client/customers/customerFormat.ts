// Formatting helpers for the licensee-customers screens.

/** played_at / last_played_at -> localized date (same UTC convention as StatisticsView). */
export function fmtDay(s: string | null | undefined, lang: string): string | null {
  if (!s) return null;
  const d = new Date(s.replace(' ', 'T') + (s.endsWith('Z') ? '' : 'Z'));
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString(lang);
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
