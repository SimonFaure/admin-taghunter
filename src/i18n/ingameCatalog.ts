/**
 * Studio-side catalog of editable in-game shared text (bucket 2).
 *
 * This is the source of truth the admin Translations grid + the XLSX translator
 * round-trip render. Each entry carries the `en` pivot source, translator
 * context (where it appears + placeholder notes), an optional char limit, and a
 * `seed` of the baseline translations we already ship.
 *
 * MIRROR of the playground baselines in
 * `taghunter_playground/src/i18n/ingame.ts` - the `en`/seed values here must
 * match the playground BASELINES (both move together). Interpolation is
 * i18next-standard `{{var}}`.
 *
 * Design: plan `multilingual-app-translator-workflow.md` (step 2d/2e).
 */

export const INGAME_NAMESPACES = [
  'ingame_common',
  'ingame_tagquest',
  'ingame_mystery',
  'ingame_tracks',
] as const;
export type IngameNamespace = (typeof INGAME_NAMESPACES)[number];

/**
 * Where each namespace's value blob is stored in `default_config`. `ingame_tagquest`
 * still lives under the legacy `tagquest_translations` key (synced today; the
 * playground absorbs it) until the backend rename (step 2c). Per-cell source-hash
 * metadata lives in a `<storeKey>__meta` companion (studio-only, never published).
 */
export const NAMESPACE_STORE_KEY: Record<IngameNamespace, string> = {
  ingame_common: 'ingame_common',
  ingame_tagquest: 'tagquest_translations',
  ingame_mystery: 'ingame_mystery',
  ingame_tracks: 'ingame_tracks',
};

export const metaStoreKey = (storeKey: string) => `${storeKey}__meta`;

export interface IngameStringDef {
  key: string;
  /** Translator-facing note: where it appears + placeholder meaning. */
  context: string;
  /** Soft max characters (on-screen overlays); shown to translators. */
  charLimit?: number;
  /** Bundled baseline translations (lang → value). Must include `en` (the pivot). */
  seed: Record<string, string>;
}

export const INGAME_CATALOG: Record<IngameNamespace, IngameStringDef[]> = {
  ingame_common: [
    {
      key: 'chip_not_recognized',
      context: 'Punch overlay - the scanned card/chip is not part of this game.',
      charLimit: 40,
      seed: { en: 'Card not recognized', fr: 'Puce non reconnue', es: 'Tarjeta no reconocida', de: 'Karte nicht erkannt', it: 'Tessera non riconosciuta', pt: 'Cartão não reconhecido' },
    },
    {
      key: 'team_already_finished',
      context: 'Punch overlay - the team has already completed the game.',
      charLimit: 40,
      seed: { en: 'Team already finished', fr: 'Équipe déjà terminée', es: 'Equipo ya terminado', de: 'Team bereits fertig', it: 'Squadra già terminata', pt: 'Equipa já terminou' },
    },
    {
      key: 'cheat_detected',
      context: 'Punch overlay - anti-cheat triggered.',
      charLimit: 40,
      seed: { en: 'Cheating detected', fr: 'Triche détectée', es: 'Trampa detectada', de: 'Betrug erkannt', it: 'Imbroglio rilevato', pt: 'Batota detetada' },
    },
    {
      key: 'error',
      context: 'Generic error fallback shown on the punch overlay.',
      charLimit: 30,
      seed: { en: 'Error', fr: 'Erreur', es: 'Error', de: 'Fehler', it: 'Errore', pt: 'Erro' },
    },
    {
      key: 'card_not_registered',
      context: 'Punch overlay - known chip but not registered to a team.',
      charLimit: 40,
      seed: { en: 'Card not registered', fr: 'Puce non enregistrée', es: 'Tarjeta no registrada', de: 'Karte nicht registriert', it: 'Tessera non registrata', pt: 'Cartão não registado' },
    },
    {
      key: 'track_finished',
      context: 'Tracks - shown when a team completes the route.',
      charLimit: 40,
      seed: { en: 'Route complete!', fr: 'Parcours terminé !', es: '¡Recorrido completado!', de: 'Strecke abgeschlossen!', it: 'Percorso completato!', pt: 'Percurso concluído!' },
    },
    {
      key: 'no_checkpoints',
      context: 'Tracks - no checkpoints were validated.',
      charLimit: 40,
      seed: { en: 'No checkpoints found', fr: 'Aucun point validé', es: 'Ningún punto validado', de: 'Keine Posten gefunden', it: 'Nessun punto trovato', pt: 'Nenhum ponto validado' },
    },
    {
      key: 'reuse_cooldown',
      context: 'Tracks - card replay cooldown. {{n}} = minutes remaining (keep the {{n}} token).',
      charLimit: 50,
      seed: { en: 'Card playable again in {{n}} min', fr: 'Puce rejouable dans {{n}} min', es: 'Tarjeta disponible en {{n}} min', de: 'Karte in {{n}} Min wieder spielbar', it: 'Tessera riutilizzabile tra {{n}} min', pt: 'Cartão jogável em {{n}} min' },
    },
  ],
  ingame_tagquest: [
    { key: 'score', context: 'TagQuest HUD - score label (uppercase).', charLimit: 16, seed: { en: 'SCORE', fr: 'SCORE', es: 'PUNTUACIÓN', de: 'PUNKTE', it: 'PUNTEGGIO', pt: 'PONTUAÇÃO' } },
    { key: 'malus', context: 'TagQuest HUD - penalty label (uppercase).', charLimit: 16, seed: { en: 'PENALTY', fr: 'MALUS', es: 'PENALIZACIÓN', de: 'STRAFE', it: 'PENALITÀ', pt: 'PENALIDADE' } },
    { key: 'late_malus', context: 'TagQuest HUD - late-penalty label (uppercase).', charLimit: 20, seed: { en: 'LATE PENALTY', fr: 'MALUS RETARD', es: 'PENALIZACIÓN TARDÍA', de: 'VERSPÄTUNGSSTRAFE', it: 'PENALITÀ IN RITARDO', pt: 'PENALIDADE TARDIA' } },
    { key: 'combo_points', context: 'TagQuest HUD - combo-points label (uppercase).', charLimit: 20, seed: { en: 'COMBO POINTS', fr: 'POINTS COMBO', es: 'PUNTOS COMBO', de: 'KOMBO-PUNKTE', it: 'PUNTI COMBO', pt: 'PONTOS COMBO' } },
    { key: 'next_malus', context: 'TagQuest timer - countdown to next late-penalty. {{s}} = seconds (keep the {{s}} token).', charLimit: 40, seed: { en: 'Next malus in {{s}} s', fr: 'Prochain malus dans {{s}} s', es: 'Próxima penalización en {{s}} s', de: 'Nächste Strafe in {{s}} s', it: 'Prossima penalità tra {{s}} s', pt: 'Próxima penalidade em {{s}} s' } },
  ],
  ingame_mystery: [],
  ingame_tracks: [],
};
