-- Seed the global tagquest HUD labels into default_config.
--
-- Stored as a single JSON row with meta='tagquest_translations'. The four
-- top-level keys (`score`, `malus`, `late_malus`, `combo_points`) are fixed in
-- code. Inner per-language values match `DEFAULT_PREVIEW_LABELS` in
-- studio-taghunter/src/scenarios/preview/previewLabels.ts and are the
-- code-level safety net - admin overrides write on top of these.
--
-- Idempotent via INSERT IGNORE on the UNIQUE(meta) key.

INSERT IGNORE INTO default_config (meta, value, version)
VALUES (
    'tagquest_translations',
    JSON_OBJECT(
        'score', JSON_OBJECT(
            'fr', 'SCORE',
            'en', 'SCORE',
            'es', 'PUNTUACIÓN',
            'de', 'PUNKTE',
            'it', 'PUNTEGGIO',
            'pt', 'PONTUAÇÃO'
        ),
        'malus', JSON_OBJECT(
            'fr', 'MALUS',
            'en', 'PENALTY',
            'es', 'PENALIZACIÓN',
            'de', 'STRAFE',
            'it', 'PENALITÀ',
            'pt', 'PENALIDADE'
        ),
        'late_malus', JSON_OBJECT(
            'fr', 'MALUS RETARD',
            'en', 'LATE PENALTY',
            'es', 'PENALIZACIÓN TARDÍA',
            'de', 'VERSPÄTUNGSSTRAFE',
            'it', 'PENALITÀ IN RITARDO',
            'pt', 'PENALIDADE TARDIA'
        ),
        'combo_points', JSON_OBJECT(
            'fr', 'POINTS COMBO',
            'en', 'COMBO POINTS',
            'es', 'PUNTOS COMBO',
            'de', 'KOMBO-PUNKTE',
            'it', 'PUNTI COMBO',
            'pt', 'PONTOS COMBO'
        )
    ),
    1
);
