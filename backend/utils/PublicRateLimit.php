<?php
/**
 * Fixed-window rate limiting for unauthenticated Events endpoints
 * (table public_rate_limits). Fails OPEN on a DB error: a broken limiter must
 * never block a sale.
 */
class PublicRateLimit {
    /**
     * The visitor's IP. Production sits behind a Google Cloud load balancer,
     * which APPENDS "<client-ip>, <lb-ip>" to X-Forwarded-For: the client is the
     * second-to-last entry (anything before it is client-supplied and spoofable).
     */
    public static function clientIp(): string {
        $xff = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? '';
        if ($xff !== '') {
            $parts = array_values(array_filter(array_map('trim', explode(',', $xff))));
            $n = count($parts);
            if ($n >= 2 && filter_var($parts[$n - 2], FILTER_VALIDATE_IP)) return $parts[$n - 2];
            if ($n === 1 && filter_var($parts[0], FILTER_VALIDATE_IP)) return $parts[0];
        }
        return (string)($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0');
    }

    /**
     * Count one hit for $bucket; true while still under $max hits per $windowSeconds.
     */
    public static function hit($db, string $bucket, int $max, int $windowSeconds): bool {
        try {
            $windowStart = gmdate('Y-m-d H:i:s', intdiv(time(), $windowSeconds) * $windowSeconds);
            $bucket = substr($bucket, 0, 120);
            $db->query(
                'INSERT INTO public_rate_limits (bucket, window_start, hits) VALUES (?, ?, 1)
                 ON DUPLICATE KEY UPDATE hits = hits + 1',
                [$bucket, $windowStart]
            );
            $row = $db->fetch('SELECT hits FROM public_rate_limits WHERE bucket = ? AND window_start = ?', [$bucket, $windowStart]);
            return !$row || (int)$row['hits'] <= $max;
        } catch (Throwable $e) {
            error_log('[PublicRateLimit] ' . $e->getMessage());
            return true;
        }
    }

    public static function purge($db): int {
        return $db->query('DELETE FROM public_rate_limits WHERE window_start < UTC_TIMESTAMP() - INTERVAL 1 DAY')->rowCount();
    }
}
