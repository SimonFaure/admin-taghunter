<?php
/**
 * Heading fonts an event page may use: the bundled families of Studio's font
 * catalog (themed fonts suit event pages: Zombie, Stranger Things...) plus the
 * system families. Files are served cross-origin by go.php?action=font.
 *
 * +-------------------------------------------------------------------------+
 * | DERIVED FROM studio-taghunter/src/fonts/catalog.ts (same list as         |
 * | go.php goCatalogFontFaces()) - KEEP IN SYNC when a font is added.        |
 * +-------------------------------------------------------------------------+
 */
require_once __DIR__ . '/PaymentsConfig.php';

class FontCatalog {
    const BUNDLED = [
        'Glacial Indifference' => [['glacial-indifference.otf', 400, 'normal'], ['glacial-indifference-bold.otf', 700, 'normal']],
        'Zombie' => [['zombie.ttf', 400, 'normal']],
        'Zombie Blood' => [['zombie-blood.ttf', 400, 'normal']],
        'Spider' => [['spider.ttf', 400, 'normal']],
        'Mortified Drip' => [['mortified-drip.ttf', 400, 'normal']],
        'October Crow' => [['october-crow.ttf', 400, 'normal']],
        'Ancient Medium' => [['ancient-medium.ttf', 400, 'normal']],
        'Trajan Pro' => [['trajan-pro.ttf', 400, 'normal'], ['trajan-pro-bold.otf', 700, 'normal']],
        'Stranger Things' => [['stranger-things.ttf', 400, 'normal']],
        'Stranger' => [['stranger.ttf', 400, 'normal']],
        'Monsters' => [['monsters.ttf', 400, 'normal']],
        'Monster' => [['monster.ttf', 400, 'normal']],
        'Caribbean' => [['caribbean.ttf', 400, 'normal']],
        'Another Danger' => [['another-danger.otf', 400, 'normal'], ['another-danger-slanted.otf', 400, 'italic']],
    ];

    const SYSTEM = [
        'Arial', 'Arial Black', 'Verdana', 'Tahoma', 'Trebuchet MS', 'Impact',
        'Georgia', 'Times New Roman', 'Courier New', 'Comic Sans MS', 'Palatino Linotype', 'Lucida Sans',
    ];

    /** Every family name a licensee can pick, for the Studio picker. */
    public static function families(): array {
        return array_merge(array_keys(self::BUNDLED), self::SYSTEM);
    }

    /** Canonical family name, or null when unknown. */
    public static function canonical(?string $family): ?string {
        if ($family === null || $family === '') return null;
        foreach (self::families() as $f) {
            if (strcasecmp($f, $family) === 0) return $f;
        }
        return null;
    }

    /** @font-face descriptors (absolute URLs) for one family; [] for system / unknown. */
    public static function faces(?string $family): array {
        $family = self::canonical($family);
        if (!$family || !isset(self::BUNDLED[$family])) return [];
        $base = PaymentsConfig::studioBase() . '/backend/api/go.php?action=font&f=';
        $out = [];
        foreach (self::BUNDLED[$family] as [$file, $weight, $style]) {
            $ext = strtolower(pathinfo($file, PATHINFO_EXTENSION));
            $out[] = [
                'family' => $family,
                'url' => $base . rawurlencode($file),
                'format' => ['otf' => 'opentype', 'ttf' => 'truetype', 'woff' => 'woff', 'woff2' => 'woff2'][$ext] ?? 'truetype',
                'weight' => $weight,
                'style' => $style,
            ];
        }
        return $out;
    }
}
