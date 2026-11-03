<?php
/** Minimal RFC 5545 calendar file for one booked slot (email attachment + download). */
class Ics {
    private static function esc(string $s): string {
        return str_replace(["\\", ';', ',', "\r\n", "\n"], ["\\\\", '\\;', '\\,', '\\n', '\\n'], $s);
    }

    /** Fold lines longer than 75 octets (continuation lines start with a space). */
    private static function fold(string $line): string {
        $out = '';
        while (strlen($line) > 75) {
            $cut = 75;
            // never split a UTF-8 multi-byte character
            while ($cut > 0 && (ord($line[$cut]) & 0xC0) === 0x80) $cut--;
            $out .= substr($line, 0, $cut) . "\r\n ";
            $line = substr($line, $cut);
        }
        return $out . $line;
    }

    /**
     * @param string $uid        stable id (booking uuid) so re-imports update, not duplicate
     * @param int    $startTs    UTC timestamp
     * @param int    $endTs      UTC timestamp
     */
    public static function event(string $uid, int $startTs, int $endTs, string $summary, string $location, string $description, string $url = ''): string {
        $lines = [
            'BEGIN:VCALENDAR',
            'VERSION:2.0',
            'PRODID:-//Tag Hunter//Events//FR',
            'CALSCALE:GREGORIAN',
            'METHOD:PUBLISH',
            'BEGIN:VEVENT',
            'UID:' . $uid . '@events.taghunter.fr',
            'DTSTAMP:' . gmdate('Ymd\THis\Z'),
            'DTSTART:' . gmdate('Ymd\THis\Z', $startTs),
            'DTEND:' . gmdate('Ymd\THis\Z', $endTs),
            'SUMMARY:' . self::esc($summary),
            'LOCATION:' . self::esc($location),
            'DESCRIPTION:' . self::esc($description),
        ];
        if ($url !== '') $lines[] = 'URL:' . $url;
        $lines[] = 'END:VEVENT';
        $lines[] = 'END:VCALENDAR';
        return implode("\r\n", array_map([self::class, 'fold'], $lines)) . "\r\n";
    }
}
