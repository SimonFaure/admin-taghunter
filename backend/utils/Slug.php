<?php
/**
 * Public URL slugs for Events: licensee slugs (events.taghunter.fr/o/<slug>)
 * and, from phase 2, event slugs (events.taghunter.fr/<slug>).
 */
class Slug {
    /** First path segments the events app uses itself. */
    const RESERVED = [
        'o', 'booking', 'bookings', 't', 'c', 'checkin', 'legal', 'api', 'assets', 'static', 'media',
        'admin', 'studio', 'events', 'event', 'search', 'login', 'help', 'about', 'contact',
        'sitemap', 'sitemap.xml', 'robots.txt', 'favicon.ico', 'taghunter', 'www', 'brand',
    ];

    /** Lowercase ASCII, words joined by "-", max $max chars. "Zombie Quest 2026!" -> "zombie-quest-2026". */
    public static function normalize(string $s, int $max = 80): string {
        $s = trim($s);
        if (function_exists('transliterator_transliterate')) {
            $t = transliterator_transliterate('Any-Latin; Latin-ASCII', $s);
            if (is_string($t)) $s = $t;
        } else {
            $t = @iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $s);
            if (is_string($t)) $s = $t;
        }
        $s = strtolower($s);
        $s = preg_replace('/[^a-z0-9]+/', '-', $s);
        $s = trim(preg_replace('/-+/', '-', $s), '-');
        return rtrim(substr($s, 0, $max), '-');
    }

    /** Error code for a candidate slug (already normalised), or null when usable. */
    public static function error(string $slug): ?string {
        if (strlen($slug) < 3) return 'slug_too_short';
        if (!preg_match('/^[a-z0-9]+(-[a-z0-9]+)*$/', $slug)) return 'slug_invalid';
        if (in_array($slug, self::RESERVED, true)) return 'slug_reserved';
        return null;
    }

    /** True when no other licensee uses $slug. */
    public static function clientSlugFree($db, string $slug, int $exceptClientId): bool {
        $row = $db->fetch('SELECT id FROM clients WHERE slug = ? AND id <> ?', [$slug, $exceptClientId]);
        return !$row;
    }
}
