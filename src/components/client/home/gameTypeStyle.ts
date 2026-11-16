// Game-type badges of the licensee home (HANDOFF.md tokens: white text on these
// fills passes WCAG AA). Labels are product names, deliberately untranslated.
export const HOME_GAME_TYPES = ['mystery', 'clash', 'tracks', 'tagquest'] as const;
export type HomeGameType = (typeof HOME_GAME_TYPES)[number];

const LABELS: Record<HomeGameType, string> = {
  mystery: 'Mystery',
  clash: 'Clash',
  tracks: 'Tracks',
  tagquest: 'Tagquest',
};

export const GAME_TYPE_BG: Record<HomeGameType, string> = {
  mystery: 'bg-th-mystery',
  clash: 'bg-th-clash',
  tracks: 'bg-th-tracks',
  tagquest: 'bg-th-tagquest',
};

export function asHomeGameType(type: string | null | undefined): HomeGameType | null {
  const k = (type || '').toLowerCase();
  return (HOME_GAME_TYPES as readonly string[]).includes(k) ? (k as HomeGameType) : null;
}

export function gameTypeLabel(type: string | null | undefined): string {
  const k = asHomeGameType(type);
  return k ? LABELS[k] : type || '';
}
