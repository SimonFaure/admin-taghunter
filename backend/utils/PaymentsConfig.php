<?php
/**
 * Reads backend/config/payments.php (git-ignored secrets for Events:
 * Stripe, Mailjet, token secret, public base URLs). Missing file or key =
 * empty default, so the rest of the studio keeps working before Events is
 * configured. Template: config/payments.example.php.
 */
class PaymentsConfig {
    private static ?array $cfg = null;

    private static function load(): array {
        if (self::$cfg === null) {
            $file = __DIR__ . '/../config/payments.php';
            $cfg = is_file($file) ? require $file : [];
            self::$cfg = is_array($cfg) ? $cfg : [];
        }
        return self::$cfg;
    }

    public static function get(string $key, $default = '') {
        $cfg = self::load();
        return array_key_exists($key, $cfg) ? $cfg[$key] : $default;
    }

    public static function stripeConfigured(): bool {
        return self::get('stripe_secret_key') !== '' && is_file(__DIR__ . '/../vendor/autoload.php');
    }

    /** True when the secret key is a live key (sk_live_ / rk_live_). */
    public static function stripeLive(): bool {
        return (bool)preg_match('/^(sk|rk)_live_/', (string)self::get('stripe_secret_key'));
    }

    public static function studioBase(): string {
        return rtrim((string)self::get('studio_base', 'https://studio.taghunter.fr'), '/');
    }

    public static function eventsPublicBase(): string {
        return rtrim((string)self::get('events_public_base', 'https://events.taghunter.fr'), '/');
    }
}
