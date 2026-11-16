<?php
// "Nouveau" badge on the licensee pages: a Tag Hunter product counts as new for
// DAYS days after it was first published.
//
// The publication date is the scenario_published row LicenseeNotifications
// records when a product goes draft -> published (once ever, so a later
// re-publish does not make it new again). Products published before that table
// existed have no row: their creation date stands in. It is never later than the
// real publication, so an old product is never flagged by mistake. Without the
// table at all, creation date only.

class ScenarioNew {
    const DAYS = 14;

    /** id => true for every published product that is still new. */
    public static function ids($db): array {
        $where = "s.scenario_type = 'product' AND s.status = 'published'";
        $since = 'DATE_SUB(NOW(), INTERVAL ' . self::DAYS . ' DAY)';
        try {
            $rows = $db->fetchAll(
                "SELECT s.id FROM scenarios s
                 LEFT JOIN licensee_notifications n
                   ON n.type = 'scenario_published' AND n.ref_id = s.id
                 WHERE $where AND COALESCE(n.created_at, s.created_at) >= $since"
            );
        } catch (Throwable $e) {
            // licensee_notifications not migrated: creation date only.
            try {
                $rows = $db->fetchAll("SELECT s.id FROM scenarios s WHERE $where AND s.created_at >= $since");
            } catch (Throwable $e2) {
                return [];
            }
        }
        $out = [];
        foreach ($rows as $r) $out[(int)$r['id']] = true;
        return $out;
    }
}
