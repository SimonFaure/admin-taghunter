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
  'ingame_clash',
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
  ingame_clash: 'ingame_clash',
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
    {
      key: 'no_station_match',
      context: 'Punch overlay - none of the punched stations belongs to the scenario pattern (wrong or missing pattern). A technical detail with the read vs expected codes is appended after it.',
      seed: { en: "None of the punched stations match this scenario's pattern", fr: 'Aucun poste bipé ne correspond au modèle du scénario', es: 'Ninguna estación marcada coincide con el modelo del escenario', de: 'Kein gestempelter Posten passt zum Muster des Szenarios', it: 'Nessuna stazione punzonata corrisponde al modello dello scenario', pt: 'Nenhum posto picado corresponde ao modelo do cenário' },
    },
    {
      key: 'pattern_missing',
      context: 'Punch overlay - the scenario has no station pattern at all (or an empty one).',
      charLimit: 50,
      seed: { en: 'Station pattern missing or empty', fr: 'Modèle de postes introuvable ou vide', es: 'Modelo de estaciones ausente o vacío', de: 'Postenmuster fehlt oder ist leer', it: 'Modello delle stazioni mancante o vuoto', pt: 'Modelo de postos em falta ou vazio' },
    },
    {
      key: 'no_quests',
      context: 'Punch overlay - the scenario data contains no quest at all.',
      charLimit: 50,
      seed: { en: 'No quest in the scenario data', fr: 'Aucune quête dans les données du scénario', es: 'No hay ninguna misión en los datos del escenario', de: 'Keine Quest in den Szenariodaten', it: 'Nessuna missione nei dati dello scenario', pt: 'Nenhuma missão nos dados do cenário' },
    },
    {
      key: 'pending_teams_prefix',
      context: 'Bottom line of the in-game screen - label before the list of teams whose reveal is queued behind the one on screen.',
      charLimit: 16,
      seed: { en: 'Waiting:', fr: 'En attente :', es: 'En espera:', de: 'Wartend:', it: 'In attesa:', pt: 'Em espera:' },
    },
  ],
  ingame_tagquest: [
    { key: 'score', context: 'Quest HUD - score label (uppercase).', charLimit: 16, seed: { en: 'SCORE', fr: 'SCORE', es: 'PUNTUACIÓN', de: 'PUNKTE', it: 'PUNTEGGIO', pt: 'PONTUAÇÃO' } },
    { key: 'malus', context: 'Quest HUD - penalty label (uppercase).', charLimit: 16, seed: { en: 'PENALTY', fr: 'MALUS', es: 'PENALIZACIÓN', de: 'STRAFE', it: 'PENALITÀ', pt: 'PENALIDADE' } },
    { key: 'late_malus', context: 'Quest HUD - late-penalty label (uppercase).', charLimit: 20, seed: { en: 'LATE PENALTY', fr: 'MALUS RETARD', es: 'PENALIZACIÓN TARDÍA', de: 'VERSPÄTUNGSSTRAFE', it: 'PENALITÀ IN RITARDO', pt: 'PENALIDADE TARDIA' } },
    { key: 'combo_points', context: 'Quest HUD - combo-points label (uppercase).', charLimit: 20, seed: { en: 'COMBO POINTS', fr: 'POINTS COMBO', es: 'PUNTOS COMBO', de: 'KOMBO-PUNKTE', it: 'PUNTI COMBO', pt: 'PONTOS COMBO' } },
    { key: 'next_malus', context: 'Quest timer - countdown to next late-penalty. {{s}} = seconds (keep the {{s}} token).', charLimit: 40, seed: { en: 'Next malus in {{s}} s', fr: 'Prochain malus dans {{s}} s', es: 'Próxima penalización en {{s}} s', de: 'Nächste Strafe in {{s}} s', it: 'Prossima penalità tra {{s}} s', pt: 'Próxima penalidade em {{s}} s' } },
    { key: 'msg_game_finished', context: 'Quest punch feedback - the team just finished the game. {{team}} = team name (keep the token).', charLimit: 60, seed: { en: '{{team}} - Game finished!', fr: '{{team}} - Partie terminée !', es: '{{team}} - ¡Partida terminada!', de: '{{team}} - Spiel beendet!', it: '{{team}} - Partita terminata!', pt: '{{team}} - Jogo terminado!' } },
    { key: 'finish_title', context: 'Quest finish screen - big title shown when a team punches the arrival station.', charLimit: 30, seed: { en: 'Finish!', fr: 'Arrivée !', es: '¡Llegada!', de: 'Ziel erreicht!', it: 'Arrivo!', pt: 'Chegada!' } },
    { key: 'finish_well_done', context: 'Quest finish screen - congratulation line under the title. {{team}} = team name (keep the token).', charLimit: 60, seed: { en: 'Well done {{team}}!', fr: 'Bravo {{team}} !', es: '¡Bravo {{team}}!', de: 'Bravo {{team}}!', it: 'Bravo {{team}}!', pt: 'Parabéns {{team}}!' } },
    { key: 'finish_time', context: 'Quest finish screen - label above the elapsed time of the team (shown uppercase).', charLimit: 20, seed: { en: 'Time', fr: 'Temps', es: 'Tiempo', de: 'Zeit', it: 'Tempo', pt: 'Tempo' } },
    { key: 'msg_quest_complete', context: 'Quest punch feedback - a quest was completed. {{team}}, {{quest}}, {{points}} (keep all tokens).', seed: { en: '{{team}} - {{quest}} complete! +{{points}} pts', fr: '{{team}} - {{quest}} terminée ! +{{points}} pts', es: '{{team}} - ¡{{quest}} completada! +{{points}} pts', de: '{{team}} - {{quest}} abgeschlossen! +{{points}} Pkt', it: '{{team}} - {{quest}} completata! +{{points}} pt', pt: '{{team}} - {{quest}} concluída! +{{points}} pts' } },
    { key: 'msg_quest_complete_malus', context: 'Same as msg_quest_complete but the team is past the deadline, so a late penalty applied. {{malus}} = penalty points (keep all tokens).', seed: { en: '{{team}} - {{quest}} complete! +{{points}} pts (−{{malus}} late malus)', fr: '{{team}} - {{quest}} terminée ! +{{points}} pts (−{{malus}} malus de retard)', es: '{{team}} - ¡{{quest}} completada! +{{points}} pts (−{{malus}} de penalización por retraso)', de: '{{team}} - {{quest}} abgeschlossen! +{{points}} Pkt (−{{malus}} Verspätungsmalus)', it: '{{team}} - {{quest}} completata! +{{points}} pt (−{{malus}} malus di ritardo)', pt: '{{team}} - {{quest}} concluída! +{{points}} pts (−{{malus}} de malus de atraso)' } },
    { key: 'msg_level_up', context: 'Quest punch feedback - the team reached a new level. {{team}}, {{level}} (keep both tokens).', charLimit: 60, seed: { en: '{{team}} - Level up: {{level}}!', fr: '{{team}} - Niveau supérieur : {{level}} !', es: '{{team}} - ¡Sube de nivel: {{level}}!', de: '{{team}} - Levelaufstieg: {{level}}!', it: '{{team}} - Salita di livello: {{level}}!', pt: '{{team}} - Subiu de nível: {{level}}!' } },
    { key: 'msg_level_up_short', context: 'Second line under a quest-completion message when the team also levelled up. {{level}} = level name.', charLimit: 40, seed: { en: 'Level up: {{level}}!', fr: 'Niveau supérieur : {{level}} !', es: '¡Sube de nivel: {{level}}!', de: 'Levelaufstieg: {{level}}!', it: 'Salita di livello: {{level}}!', pt: 'Subiu de nível: {{level}}!' } },
    { key: 'msg_partial_quest_one', context: 'Quest punch feedback - partial progress, SINGULAR form (exactly 1 image). {{team}}, {{quest}}, {{count}}.', seed: { en: '{{team}} - {{quest}}: {{count}} image found', fr: '{{team}} - {{quest}} : {{count}} image trouvée', es: '{{team}} - {{quest}}: {{count}} imagen encontrada', de: '{{team}} - {{quest}}: {{count}} Bild gefunden', it: '{{team}} - {{quest}}: {{count}} immagine trovata', pt: '{{team}} - {{quest}}: {{count}} imagem encontrada' } },
    { key: 'msg_partial_quest_other', context: 'Quest punch feedback - partial progress, PLURAL form. {{team}}, {{quest}}, {{count}}.', seed: { en: '{{team}} - {{quest}}: {{count}} images found', fr: '{{team}} - {{quest}} : {{count}} images trouvées', es: '{{team}} - {{quest}}: {{count}} imágenes encontradas', de: '{{team}} - {{quest}}: {{count}} Bilder gefunden', it: '{{team}} - {{quest}}: {{count}} immagini trovate', pt: '{{team}} - {{quest}}: {{count}} imagens encontradas' } },
  ],
  // Mystery start-bip feedback. A scenario can override each of these from the
  // editor's "UI text strings" section; these are the built-in fallbacks
  // (MIRROR of MYSTERY_BASELINE in the playground's i18n/ingame.ts).
  ingame_mystery: [
    { key: 'player_starts', context: 'Mystery start reader - confirmation that the team just started. {{team}} = team name (keep the token).', charLimit: 50, seed: { en: 'Here we go! {{team}}', fr: "C'est parti ! {{team}}", es: '¡Empezamos! {{team}}', de: "Los geht's! {{team}}", it: 'Si parte! {{team}}', pt: 'Vamos lá! {{team}}' } },
    { key: 'player_starts_card_not_empty', context: 'Same as player_starts but the card still carried punches from a previous run. Keep the warning half.', seed: { en: 'Here we go! {{team}} - ⚠️ Your card is not empty, wipe it', fr: "C'est parti ! {{team}} - ⚠️ Votre puce n'est pas vide, effacez votre puce", es: '¡Empezamos! {{team}} - ⚠️ Tu tarjeta no está vacía, bórrala', de: "Los geht's! {{team}} - ⚠️ Deine Karte ist nicht leer, bitte löschen", it: 'Si parte! {{team}} - ⚠️ La tua tessera non è vuota, cancellala', pt: 'Vamos lá! {{team}} - ⚠️ O seu cartão não está vazio, apague-o' } },
  ],
  // Track HUD captions + the start-reader dialogue when a card arrives with
  // punches still on it. Player-facing, so they resolve against the team
  // language (MIRROR of TRACKS_BASELINE in the playground's i18n/ingame.ts).
  ingame_tracks: [
    { key: 'hud_time', context: 'Track HUD - caption over the run timer.', charLimit: 12, seed: { en: 'Time', fr: 'Temps', es: 'Tiempo', de: 'Zeit', it: 'Tempo', pt: 'Tempo' } },
    { key: 'hud_score', context: 'Track HUD - caption over the score frame.', charLimit: 12, seed: { en: 'Score', fr: 'Score', es: 'Puntuación', de: 'Punkte', it: 'Punteggio', pt: 'Pontuação' } },
    { key: 'summary_checkpoints', context: 'Track simple display mode - checkpoints reached out of the route total. {{hit}} and {{total}} are numbers (keep both tokens).', charLimit: 40, seed: { en: '{{hit}} / {{total}} checkpoints', fr: '{{hit}} / {{total}} points de contrôle', es: '{{hit}} / {{total}} puntos de control', de: '{{hit}} / {{total}} Posten', it: '{{hit}} / {{total}} punti di controllo', pt: '{{hit}} / {{total}} pontos de controlo' } },
    { key: 'card_not_empty_hold', context: 'Track start reader - the card still carries punches, so the run was NOT started. Tells the player the two ways out: bip again to score what is on the card, or wipe it and bip to start fresh.', seed: { en: 'Your card is not empty. Bip it again to recover your run, or wipe it and bip to start.', fr: "Votre puce n'est pas vide. Bipez-la à nouveau pour récupérer votre parcours, ou effacez-la puis bipez pour démarrer.", es: 'Tu tarjeta no está vacía. Pásala de nuevo para recuperar tu recorrido, o bórrala y pásala para empezar.', de: 'Deine Karte ist nicht leer. Stemple sie erneut, um deinen Lauf zu übernehmen, oder lösche sie und stemple zum Start.', it: 'La tua tessera non è vuota. Passala di nuovo per recuperare il percorso, oppure cancellala e passala per iniziare.', pt: 'O seu cartão não está vazio. Pique-o novamente para recuperar o percurso, ou apague-o e pique para começar.' } },
    { key: 'card_recovered', context: 'Track start reader - confirmation that the punches already on the card were scored as a finished run.', charLimit: 45, seed: { en: 'Run recovered from the card', fr: 'Parcours récupéré sur la puce', es: 'Recorrido recuperado de la tarjeta', de: 'Lauf von der Karte übernommen', it: 'Percorso recuperato dalla tessera', pt: 'Percurso recuperado do cartão' } },
    { key: 'no_station_match', context: 'Track scoring - operator diagnostic: the card carried punches but not one of them belongs to a checkpoint station, so the pattern is almost certainly wrong.', seed: { en: 'None of the card punches match a checkpoint - check the pattern bound to this scenario.', fr: 'Aucun poinçon de la puce ne correspond aux points de contrôle - vérifiez le modèle associé au scénario.', es: 'Ningún marcaje de la tarjeta coincide con un punto de control: revisa el modelo asociado al escenario.', de: 'Kein Stempel der Karte passt zu einem Posten - prüfe das Muster dieses Szenarios.', it: 'Nessuna punzonatura della tessera corrisponde a un punto di controllo: controlla il modello associato allo scenario.', pt: 'Nenhuma picagem do cartão corresponde a um ponto de controlo - verifique o modelo associado ao cenário.' } },
    { key: 'player_starts', context: 'Track start reader - confirmation that the team just started. {{team}} = team name (keep the token).', charLimit: 50, seed: { en: 'Here we go! {{team}}', fr: "C'est parti ! {{team}}", es: '¡Empezamos! {{team}}', de: "Los geht's! {{team}}", it: 'Si parte! {{team}}', pt: 'Vamos lá! {{team}}' } },
    { key: 'card_not_empty_warn', context: 'Track start reader - warning appended after player_starts when the card still carried punches.', charLimit: 60, seed: { en: '⚠️ Your card is not empty, wipe it', fr: "⚠️ Votre puce n'est pas vide, effacez votre puce", es: '⚠️ Tu tarjeta no está vacía, bórrala', de: '⚠️ Deine Karte ist nicht leer, bitte löschen', it: '⚠️ La tua tessera non è vuota, cancellala', pt: '⚠️ O seu cartão não está vazio, apague-o' } },
  ],
  // Clash registration screen + live match (punch feedback, purge, event feed)
  // + final results. All of it renders in the language chosen at LAUNCH, so
  // these are player-facing strings, not operator chrome.
  ingame_clash: [
    { key: "title", context: "Clash registration screen - page title.", charLimit: 30, seed: { en: "Clan registration", fr: "Inscription des clans", es: "Inscripción de clanes", de: "Clan-Anmeldung", it: "Iscrizione dei clan", pt: "Inscrição dos clãs" } },
    { key: "back", context: "Clash registration screen - link back out of the game.", charLimit: 16, seed: { en: "Back", fr: "Retour", es: "Volver", de: "Zurück", it: "Indietro", pt: "Voltar" } },
    { key: "intro_locked_one", context: "Clash registration - intro when this station is locked to a single clan.", seed: { en: "This station registers one clan only - players bip their chip here to join it.", fr: "Cette station inscrit un seul clan - les joueurs bipent leur puce ici pour le rejoindre.", es: "Esta estación inscribe un solo clan: los jugadores pasan su tarjeta aquí para unirse.", de: "Diese Station meldet nur einen Clan an - Spieler stempeln hier ihre Karte, um beizutreten.", it: "Questa postazione iscrive un solo clan: i giocatori passano qui la tessera per unirsi.", pt: "Esta estação inscreve apenas um clã - os jogadores picam aqui o seu cartão para entrar." } },
    { key: "intro_locked_many", context: "Clash registration - intro when this station is locked to several clans.", seed: { en: "This station registers the clans below only - pick one, then players bip their chip to join it.", fr: "Cette station inscrit uniquement les clans ci-dessous - choisissez-en un, puis les joueurs bipent leur puce pour le rejoindre.", es: "Esta estación inscribe únicamente los clanes de abajo: elige uno y los jugadores pasan su tarjeta para unirse.", de: "Diese Station meldet nur die unten stehenden Clans an - wähle einen aus, dann stempeln die Spieler ihre Karte zum Beitreten.", it: "Questa postazione iscrive solo i clan qui sotto: scegline uno, poi i giocatori passano la tessera per unirsi.", pt: "Esta estação inscreve apenas os clãs abaixo - escolha um e os jogadores picam o cartão para entrar." } },
    { key: "intro_self", context: "Clash registration - intro in self-register mode (any clan pickable).", seed: { en: "Select a clan on this station, then players bip their chip to join it. Leave a station on one clan to use it as a dedicated join reader.", fr: "Sélectionnez un clan sur cette station, puis les joueurs bipent leur puce pour le rejoindre. Laissez une station sur un clan pour en faire un lecteur d'inscription dédié.", es: "Selecciona un clan en esta estación y los jugadores pasarán su tarjeta para unirse. Deja una estación fija en un clan para usarla como lector de inscripción.", de: "Wähle auf dieser Station einen Clan, dann stempeln die Spieler ihre Karte zum Beitreten. Eine dauerhaft auf einen Clan gestellte Station dient als eigener Anmelde-Leser.", it: "Seleziona un clan su questa postazione, poi i giocatori passano la tessera per unirsi. Lascia una postazione fissa su un clan per usarla come lettore di iscrizione.", pt: "Selecione um clã nesta estação e os jogadores picam o cartão para entrar. Deixe uma estação fixa num clã para a usar como leitor de inscrição." } },
    { key: "intro_bulk", context: "Clash registration - intro in predetermined-teams mode (read-only screen).", seed: { en: "Clans were formed at launch (predetermined teams). Review the counts below, then start the game.", fr: "Les clans ont été formés au lancement (équipes prédéterminées). Vérifiez les effectifs ci-dessous, puis démarrez la partie.", es: "Los clanes se formaron al lanzar la partida (equipos predeterminados). Revisa los efectivos y empieza la partida.", de: "Die Clans wurden beim Start gebildet (vorgegebene Teams). Prüfe die Zahlen unten und starte das Spiel.", it: "I clan sono stati formati al lancio (squadre predefinite). Controlla i numeri qui sotto, poi avvia la partita.", pt: "Os clãs foram formados no lançamento (equipas predefinidas). Verifique os números abaixo e inicie o jogo." } },
    { key: "no_assigned_clan", context: "Clash registration - this station is assigned to clans that do not exist in the launch.", seed: { en: "No clan matches this station's assignment - ask the operator to update it from the Devices panel.", fr: "Aucun clan ne correspond à l'affectation de cette station - demandez à l'opérateur de la mettre à jour depuis le panneau Appareils.", es: "Ningún clan coincide con la asignación de esta estación: pide al operador que la actualice desde el panel Dispositivos.", de: "Kein Clan passt zur Zuweisung dieser Station - lass sie vom Betreiber im Geräte-Panel aktualisieren.", it: "Nessun clan corrisponde all'assegnazione di questa postazione: chiedi all'operatore di aggiornarla dal pannello Dispositivi.", pt: "Nenhum clã corresponde à atribuição desta estação - peça ao operador para a atualizar no painel Dispositivos." } },
    { key: "full", context: "Clash registration - badge on a clan card that hit the per-clan cap (uppercase).", charLimit: 12, seed: { en: "Full", fr: "Complet", es: "Completo", de: "Voll", it: "Al completo", pt: "Completo" } },
    { key: "clan_fallback", context: "Clash - clan name fallback when the scenario names none. {{n}} = clan number (keep the token).", charLimit: 20, seed: { en: "Clan {{n}}", fr: "Clan {{n}}", es: "Clan {{n}}", de: "Clan {{n}}", it: "Clan {{n}}", pt: "Clã {{n}}" } },
    { key: "station_complete", context: "Clash registration - every clan assigned to this station is full.", charLimit: 50, seed: { en: "Registration complete on this station", fr: "Inscription terminée sur cette station", es: "Inscripción completada en esta estación", de: "Anmeldung auf dieser Station abgeschlossen", it: "Iscrizione completata su questa postazione", pt: "Inscrição concluída nesta estação" } },
    { key: "station_complete_one", context: "Clash registration - subtitle when the single assigned clan is full.", charLimit: 50, seed: { en: "The assigned clan is full.", fr: "Le clan affecté est complet.", es: "El clan asignado está completo.", de: "Der zugewiesene Clan ist voll.", it: "Il clan assegnato è al completo.", pt: "O clã atribuído está completo." } },
    { key: "station_complete_many", context: "Clash registration - subtitle when all assigned clans are full.", charLimit: 50, seed: { en: "All assigned clans are full.", fr: "Tous les clans affectés sont complets.", es: "Todos los clanes asignados están completos.", de: "Alle zugewiesenen Clans sind voll.", it: "Tutti i clan assegnati sono al completo.", pt: "Todos os clãs atribuídos estão completos." } },
    { key: "bip_to_join", context: "Clash registration - call to action. {{clan}} = clan name, rendered in the clan colour (keep the token).", charLimit: 60, seed: { en: "Bip a chip to join {{clan}}", fr: "Bipez une puce pour rejoindre {{clan}}", es: "Pasa una tarjeta para unirte a {{clan}}", de: "Karte stempeln, um {{clan}} beizutreten", it: "Passa una tessera per unirti a {{clan}}", pt: "Pique um cartão para entrar em {{clan}}" } },
    { key: "select_clan_hint", context: "Clash registration - no clan selected yet on this station.", charLimit: 60, seed: { en: "Select a clan above to start enrolling players.", fr: "Sélectionnez un clan ci-dessus pour commencer les inscriptions.", es: "Selecciona un clan arriba para empezar a inscribir jugadores.", de: "Wähle oben einen Clan, um Spieler anzumelden.", it: "Seleziona un clan qui sopra per iniziare a iscrivere i giocatori.", pt: "Selecione um clã acima para começar a inscrever jogadores." } },
    { key: "join_ok", context: "Clash registration - a chip just joined. {{clan}} = clan name (keep the token).", charLimit: 40, seed: { en: "Joined {{clan}} ✓", fr: "{{clan}} rejoint ✓", es: "{{clan}}: unido ✓", de: "{{clan}} beigetreten ✓", it: "{{clan}}: iscritto ✓", pt: "{{clan}}: entrou ✓" } },
    { key: "join_clan_full", context: "Clash registration - join refused, the clan hit its cap.", charLimit: 45, seed: { en: "Clan full - pick another clan", fr: "Clan complet - choisissez un autre clan", es: "Clan completo: elige otro clan", de: "Clan voll - wähle einen anderen Clan", it: "Clan al completo: scegli un altro clan", pt: "Clã completo - escolha outro clã" } },
    { key: "join_already_in_clan", context: "Clash registration - the chip is already in the selected clan.", charLimit: 40, seed: { en: "Already in this clan", fr: "Déjà dans ce clan", es: "Ya está en este clan", de: "Bereits in diesem Clan", it: "Già in questo clan", pt: "Já está neste clã" } },
    { key: "join_already_other_clan", context: "Clash registration - the chip belongs to a different clan already.", charLimit: 50, seed: { en: "Chip already belongs to another clan", fr: "Cette puce appartient déjà à un autre clan", es: "La tarjeta ya pertenece a otro clan", de: "Karte gehört bereits zu einem anderen Clan", it: "La tessera appartiene già a un altro clan", pt: "O cartão já pertence a outro clã" } },
    { key: "bulk_footer", context: "Clash registration - footer in predetermined-teams mode. {{start}} = the Start-game button label, rendered bold (keep the token).", seed: { en: "Predetermined clans - chips were dealt at launch. The counts above are final; press {{start}} when ready.", fr: "Clans prédéterminés - les puces ont été distribuées au lancement. Les effectifs ci-dessus sont définitifs ; appuyez sur {{start}} quand vous êtes prêt.", es: "Clanes predeterminados: las tarjetas se repartieron al lanzar. Los efectivos de arriba son definitivos; pulsa {{start}} cuando estés listo.", de: "Vorgegebene Clans - die Karten wurden beim Start verteilt. Die Zahlen oben sind endgültig; drücke {{start}}, wenn du bereit bist.", it: "Clan predefiniti: le tessere sono state distribuite al lancio. I numeri qui sopra sono definitivi; premi {{start}} quando sei pronto.", pt: "Clãs predefinidos - os cartões foram distribuídos no lançamento. Os números acima são definitivos; prima {{start}} quando estiver pronto." } },
    { key: "start_game", context: "Clash registration - the button that starts the match.", charLimit: 24, seed: { en: "Start game", fr: "Démarrer la partie", es: "Empezar partida", de: "Spiel starten", it: "Avvia la partita", pt: "Iniciar jogo" } },
    { key: "results_winner", context: "Clash results - headline. {{clan}} = winning clan name (keep the token).", charLimit: 40, seed: { en: "{{clan}} wins!", fr: "{{clan}} l'emporte !", es: "¡{{clan}} gana!", de: "{{clan}} gewinnt!", it: "{{clan}} vince!", pt: "{{clan}} vence!" } },
    { key: "results_draw", context: "Clash results - headline when the top clans are tied.", charLimit: 24, seed: { en: "Draw!", fr: "Égalité !", es: "¡Empate!", de: "Unentschieden!", it: "Pareggio!", pt: "Empate!" } },
    { key: "results_no_territory", context: "Clash results - headline when nobody scored.", charLimit: 30, seed: { en: "No territory taken", fr: "Aucun territoire conquis", es: "Ningún territorio conquistado", de: "Kein Territorium erobert", it: "Nessun territorio conquistato", pt: "Nenhum território conquistado" } },
    { key: "pts", context: "Clash - points unit after a number (\"42 pts\"). Shown uppercase in the live ranking.", charLimit: 8, seed: { en: "pts", fr: "pts", es: "pts", de: "Pkt", it: "pt", pt: "pts" } },
    { key: "territories", context: "Clash results - section heading over the final ownership grid (uppercase).", charLimit: 20, seed: { en: "Territories", fr: "Territoires", es: "Territorios", de: "Territorien", it: "Territori", pt: "Territórios" } },
    { key: "neutral", context: "Clash results - a territory nobody controls at the final whistle.", charLimit: 12, seed: { en: "Neutral", fr: "Neutre", es: "Neutral", de: "Neutral", it: "Neutrale", pt: "Neutro" } },
    { key: "territory_fallback", context: "Clash - territory name fallback when the scenario names none. {{n}} = territory number (keep the token).", charLimit: 20, seed: { en: "Territory {{n}}", fr: "Territoire {{n}}", es: "Territorio {{n}}", de: "Territorium {{n}}", it: "Territorio {{n}}", pt: "Território {{n}}" } },
    { key: "pts_per_min", context: "Clash results - per-minute rate unit after a number (\"3 pts/min\").", charLimit: 12, seed: { en: "pts/min", fr: "pts/min", es: "pts/min", de: "Pkt/Min", it: "pt/min", pt: "pts/min" } },
    { key: "back_to_games", context: "Clash results - the button that leaves the results screen.", charLimit: 24, seed: { en: "Back to games", fr: "Retour aux parties", es: "Volver a las partidas", de: "Zurück zu den Spielen", it: "Torna alle partite", pt: "Voltar aos jogos" } },
    { key: "msg_not_registered", context: "Clash punch overlay - the chip is not bound to any clan.", charLimit: 45, seed: { en: "Chip not registered to a clan", fr: "Puce non rattachée à un clan", es: "Tarjeta no asignada a ningún clan", de: "Karte keinem Clan zugeordnet", it: "Tessera non assegnata a un clan", pt: "Cartão não associado a nenhum clã" } },
    { key: "msg_game_over", context: "Clash punch overlay - a chip was read after the match ended.", charLimit: 30, seed: { en: "Game over", fr: "Partie terminée", es: "Partida terminada", de: "Spiel beendet", it: "Partita terminata", pt: "Jogo terminado" } },
    { key: "msg_purge_already_used", context: "Clash punch overlay - the clan already spent its single purge.", charLimit: 50, seed: { en: "Purge already used by your clan", fr: "Purge déjà utilisée par votre clan", es: "Tu clan ya ha usado la purga", de: "Deine Sippe hat die Säuberung bereits genutzt", it: "Il tuo clan ha già usato la purga", pt: "O teu clã já usou a purga" } },
    { key: "msg_purge_own_territory", context: "Clash punch overlay - purge refused, the target is the clan own territory.", charLimit: 50, seed: { en: "You cannot purge your own territory", fr: "Impossible de purger votre propre territoire", es: "No puedes purgar tu propio territorio", de: "Du kannst dein eigenes Territorium nicht säubern", it: "Non puoi purgare il tuo territorio", pt: "Não podes purgar o teu próprio território" } },
    { key: "msg_purge_no_target", context: "Clash punch overlay - purge punched but no territory qualifies as a target.", charLimit: 50, seed: { en: "No territory to purge right now", fr: "Aucun territoire à purger pour le moment", es: "Ningún territorio que purgar por ahora", de: "Derzeit kein Territorium zum Säubern", it: "Nessun territorio da purgare per ora", pt: "Nenhum território a purgar de momento" } },
    { key: "msg_territory_incomplete", context: "Clash punch overlay - nothing credited; names the territory the read came closest to. {{territory}} = territory name (keep the token).", charLimit: 45, seed: { en: "{{territory}} incomplete", fr: "{{territory}} incomplet", es: "{{territory}} incompleto", de: "{{territory}} unvollständig", it: "{{territory}} incompleto", pt: "{{territory}} incompleto" } },
    { key: "msg_territory_incomplete_generic", context: "Clash punch overlay - same as msg_territory_incomplete when the territory has no authored name.", charLimit: 45, seed: { en: "Territory incomplete", fr: "Territoire incomplet", es: "Territorio incompleto", de: "Territorium unvollständig", it: "Territorio incompleto", pt: "Território incompleto" } },
    { key: "msg_no_fresh_punch", context: "Clash punch overlay - every punch on the badge was already spent on an earlier validation.", charLimit: 60, seed: { en: "No new punch - punch the stations again", fr: "Aucun bip nouveau - repique les balises", es: "Ningún marcaje nuevo: vuelve a picar las balizas", de: "Kein neuer Stempel - stemple die Stationen erneut", it: "Nessuna nuova punzonatura - ripunzona le lanterne", pt: "Nenhuma picagem nova - pique as balizas de novo" } },
    { key: "msg_missing_balises_one", context: "Clash punch overlay - appended after the \"territory incomplete\" line to name the stations the team still has to punch. {{list}} = the station numbers, already comma-separated (keep the token; do not add your own separators). SINGULAR form (exactly 1 station missing).", charLimit: 60, seed: { en: "still missing station {{list}}", fr: "il manque la balise {{list}}", es: "falta la baliza {{list}}", de: "es fehlt der Posten {{list}}", it: "manca la lanterna {{list}}", pt: "falta a baliza {{list}}" } },
    { key: "msg_missing_balises_other", context: "Clash punch overlay - appended after the \"territory incomplete\" line to name the stations the team still has to punch. {{list}} = the station numbers, already comma-separated (keep the token; do not add your own separators). PLURAL form (2+ stations missing).", charLimit: 60, seed: { en: "still missing stations {{list}}", fr: "il manque les balises {{list}}", es: "faltan las balizas {{list}}", de: "es fehlen die Posten {{list}}", it: "mancano le lanterne {{list}}", pt: "faltam as balizas {{list}}" } },
    { key: "msg_territory_captured", context: "Clash punch overlay - a territory was just captured. {{territory}} = territory name (keep the token).", charLimit: 45, seed: { en: "{{territory}} complete!", fr: "{{territory}} complété !", es: "¡{{territory}} completado!", de: "{{territory}} abgeschlossen!", it: "{{territory}} completato!", pt: "{{territory}} concluído!" } },
    { key: "msg_territory_captured_generic", context: "Clash punch overlay - same as msg_territory_captured when the territory has no authored name.", charLimit: 45, seed: { en: "Territory complete!", fr: "Territoire complété !", es: "¡Territorio completado!", de: "Territorium abgeschlossen!", it: "Territorio completato!", pt: "Território concluído!" } },
    { key: "purge_announcement", context: "Clash purge flash + event feed - predicate after the clan name (rendered separately in the clan colour). {{territory}} = territory name (keep the token).", charLimit: 50, seed: { en: "purged {{territory}}!", fr: "a purgé {{territory}} !", es: "¡ha purgado {{territory}}!", de: "hat {{territory}} gesäubert!", it: "ha purgato {{territory}}!", pt: "purgou {{territory}}!" } },
    { key: "purge_available", context: "Clash ranking panel - tooltip on a clan that still holds its purge.", charLimit: 30, seed: { en: "Purge available", fr: "Purge disponible", es: "Purga disponible", de: "Säuberung verfügbar", it: "Purga disponibile", pt: "Purga disponível" } },
    { key: "purge_used", context: "Clash ranking panel - tooltip on a clan that already used its purge.", charLimit: 30, seed: { en: "Purge used", fr: "Purge utilisée", es: "Purga usada", de: "Säuberung verbraucht", it: "Purga usata", pt: "Purga usada" } },
    { key: "event_conquest", context: "Clash event feed - predicate after the clan name (rendered separately in the clan colour). {{territory}} = territory name (keep the token).", charLimit: 45, seed: { en: "conquered {{territory}}!", fr: "a conquis {{territory}} !", es: "¡ha conquistado {{territory}}!", de: "hat {{territory}} erobert!", it: "ha conquistato {{territory}}!", pt: "conquistou {{territory}}!" } },
    { key: "event_attack", context: "Clash event feed - predicate after the clan name. {{territory}} = territory name (keep the token).", charLimit: 45, seed: { en: "is attacking {{territory}}!", fr: "attaque {{territory}} !", es: "¡ataca {{territory}}!", de: "greift {{territory}} an!", it: "attacca {{territory}}!", pt: "ataca {{territory}}!" } },
    { key: "event_neutralized", context: "Clash event feed - predicate after the clan name. {{territory}} = territory name (keep the token).", charLimit: 45, seed: { en: "neutralised {{territory}}!", fr: "a neutralisé {{territory}} !", es: "¡ha neutralizado {{territory}}!", de: "hat {{territory}} neutralisiert!", it: "ha neutralizzato {{territory}}!", pt: "neutralizou {{territory}}!" } },
    { key: "event_other", context: "Clash event feed - fallback predicate for an unknown event kind. {{territory}} = territory name (keep the token).", charLimit: 45, seed: { en: "- {{territory}}", fr: "- {{territory}}", es: "- {{territory}}", de: "- {{territory}}", it: "- {{territory}}", pt: "- {{territory}}" } },
    { key: "age_just_now", context: "Clash event feed - age of an event less than a minute old.", charLimit: 20, seed: { en: "just now", fr: "à l'instant", es: "ahora mismo", de: "gerade eben", it: "proprio ora", pt: "agora mesmo" } },
    { key: "age_minutes", context: "Clash event feed - event age in minutes. {{n}} = minutes (keep the token).", charLimit: 20, seed: { en: "{{n}} min ago", fr: "il y a {{n}} min", es: "hace {{n}} min", de: "vor {{n}} Min", it: "{{n}} min fa", pt: "há {{n}} min" } },
    { key: "age_hours", context: "Clash event feed - event age in hours. {{n}} = hours (keep the token).", charLimit: 20, seed: { en: "{{n}} h ago", fr: "il y a {{n}} h", es: "hace {{n}} h", de: "vor {{n}} Std", it: "{{n}} h fa", pt: "há {{n}} h" } },
    { key: "ranking_title", context: "Clash live dashboard - heading over the right-hand ranking panel (uppercase).", charLimit: 26, seed: { en: "Clan ranking", fr: "Classement des clans", es: "Clasificación de clanes", de: "Clan-Rangliste", it: "Classifica dei clan", pt: "Classificação dos clãs" } },
    { key: "rate_per_min", context: "Clash live dashboard - a live earning rate for one clan. {{n}} = points per minute (keep the token).", charLimit: 18, seed: { en: "+{{n}} pts/min", fr: "+{{n}} pts/min", es: "+{{n}} pts/min", de: "+{{n}} Pkt/Min", it: "+{{n}} pt/min", pt: "+{{n}} pts/min" } },
  ],
};
