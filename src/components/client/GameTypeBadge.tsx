import { useTranslation } from 'react-i18next';
import { Sparkles } from 'lucide-react';
import { GAME_TYPE_BG, asHomeGameType, gameTypeLabel } from './home/gameTypeStyle';

// The licensee pages' game-type badge: the solid, uppercase pill of the home
// scenario cards (white on the HANDOFF.md type colors, AA contrast). Use it
// wherever a licensee page shows a scenario's game type, so the four types read
// the same everywhere. Unknown codes get a neutral fill.
const PILL = 'inline-flex flex-none items-center gap-1 whitespace-nowrap rounded-full font-bold uppercase leading-none tracking-[.04em]';
const SIZES = {
  sm: 'px-[9px] py-1 text-[11px]',
  md: 'px-3 py-1.5 text-xs',
} as const;

export function GameTypeBadge({
  type,
  size = 'sm',
  className = '',
}: {
  type: string | null | undefined;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  if (!type) return null;
  const k = asHomeGameType(type);
  return (
    <span className={`${PILL} ${SIZES[size]} text-white ${k ? GAME_TYPE_BG[k] : 'bg-th-ink2'} ${className}`}>
      {gameTypeLabel(type)}
    </span>
  );
}

// "Nouveau": a product published less than two weeks ago (server-side `is_new`,
// see backend/utils/ScenarioNew.php). Yellow on ink so it never reads as a type.
export function NewBadge({ size = 'sm', className = '' }: { size?: keyof typeof SIZES; className?: string }) {
  const { t } = useTranslation('common');
  return (
    <span className={`${PILL} ${SIZES[size]} bg-[#FACC15] text-th-ink ${className}`} title={t('newBadgeTitle')}>
      <Sparkles className={size === 'md' ? 'h-3.5 w-3.5' : 'h-3 w-3'} aria-hidden="true" />
      {t('newBadge')}
    </span>
  );
}
