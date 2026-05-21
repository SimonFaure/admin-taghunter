-- Tagquest layout injection — append the 11 new text elements introduced in
-- canonical layout v3.0 to every existing `layouts` row of game_type='tagquest'
-- that does NOT already contain them. Idempotent: re-running is a no-op.
--
-- Elements injected:
--   animation_quest_name, score_label, malus_label, late_malus_label, combo_points_label,
--   quest_1_name ... quest_6_name
--
-- Coordinates mirror the canonical TS source at
--   studio-taghunter/src/scenarios/bodies/tagquest/defaultLayout.ts
--
-- Note: the system default row is replaced wholesale by
--   tagquest_default_layout_migration.sql (run that one for system layouts).
-- This script is for admin/client custom layouts that may already exist.

START TRANSACTION;

UPDATE layouts
SET layout_data = JSON_ARRAY_APPEND(
    layout_data,
    '$.elements', JSON_OBJECT(
        'id', 'animation_quest_name', 'type', 'text', 'name', 'Active Quest Name',
        'previewText', 'Quest 1',
        'x', 32, 'y', 78.5, 'width', 40, 'height', 4,
        'fontSize', 18, 'fontFamily', 'Arial Black, Arial, sans-serif', 'color', '#000000ff'),
    '$.elements', JSON_OBJECT(
        'id', 'score_label', 'type', 'text', 'name', 'Score Label',
        'previewText', 'SCORE',
        'x', 79, 'y', 1.2, 'width', 17, 'height', 3,
        'fontSize', 12, 'fontFamily', 'Arial Black, Arial, sans-serif', 'color', '#000000ff'),
    '$.elements', JSON_OBJECT(
        'id', 'malus_label', 'type', 'text', 'name', 'Malus Label',
        'previewText', 'MALUS',
        'x', 4, 'y', 25.3, 'width', 16, 'height', 3,
        'fontSize', 12, 'fontFamily', 'Arial Black, Arial, sans-serif', 'color', '#000000ff'),
    '$.elements', JSON_OBJECT(
        'id', 'late_malus_label', 'type', 'text', 'name', 'Late Malus Label',
        'previewText', 'LATE MALUS',
        'x', 4, 'y', 50.1, 'width', 16, 'height', 3,
        'fontSize', 12, 'fontFamily', 'Arial Black, Arial, sans-serif', 'color', '#000000ff'),
    '$.elements', JSON_OBJECT(
        'id', 'combo_points_label', 'type', 'text', 'name', 'Combo Points Label',
        'previewText', 'COMBO POINTS',
        'x', 2, 'y', 74, 'width', 22, 'height', 3,
        'fontSize', 12, 'fontFamily', 'Arial Black, Arial, sans-serif', 'color', '#000000ff'),
    '$.elements', JSON_OBJECT(
        'id', 'quest_1_name', 'type', 'text', 'name', 'Quest 1 Name',
        'previewText', 'Quest 1',
        'x', 79, 'y', 21.4, 'width', 21, 'height', 2.8,
        'fontSize', 11, 'fontFamily', 'Arial Black, Arial, sans-serif', 'color', '#000000ff'),
    '$.elements', JSON_OBJECT(
        'id', 'quest_2_name', 'type', 'text', 'name', 'Quest 2 Name',
        'previewText', 'Quest 2',
        'x', 79, 'y', 34.55, 'width', 21, 'height', 2.8,
        'fontSize', 11, 'fontFamily', 'Arial Black, Arial, sans-serif', 'color', '#000000ff'),
    '$.elements', JSON_OBJECT(
        'id', 'quest_3_name', 'type', 'text', 'name', 'Quest 3 Name',
        'previewText', 'Quest 3',
        'x', 79, 'y', 47.7, 'width', 21, 'height', 2.8,
        'fontSize', 11, 'fontFamily', 'Arial Black, Arial, sans-serif', 'color', '#000000ff'),
    '$.elements', JSON_OBJECT(
        'id', 'quest_4_name', 'type', 'text', 'name', 'Quest 4 Name',
        'previewText', 'Quest 4',
        'x', 79, 'y', 60.85, 'width', 21, 'height', 2.8,
        'fontSize', 11, 'fontFamily', 'Arial Black, Arial, sans-serif', 'color', '#000000ff'),
    '$.elements', JSON_OBJECT(
        'id', 'quest_5_name', 'type', 'text', 'name', 'Quest 5 Name',
        'previewText', 'Quest 5',
        'x', 79, 'y', 74, 'width', 21, 'height', 2.8,
        'fontSize', 11, 'fontFamily', 'Arial Black, Arial, sans-serif', 'color', '#000000ff'),
    '$.elements', JSON_OBJECT(
        'id', 'quest_6_name', 'type', 'text', 'name', 'Quest 6 Name',
        'previewText', 'Quest 6',
        'x', 79, 'y', 87.15, 'width', 21, 'height', 2.8,
        'fontSize', 11, 'fontFamily', 'Arial Black, Arial, sans-serif', 'color', '#000000ff')
),
    version = '3.0',
    updated_at = CURRENT_TIMESTAMP
WHERE game_type = 'tagquest'
  AND JSON_SEARCH(layout_data, 'one', 'animation_quest_name', NULL, '$.elements[*].id') IS NULL;

COMMIT;
