<?php
/**
 * Licensee legal identity for Events (receipts, event page footer, commission
 * invoices, Stripe account country). Columns on `clients`, migration
 * add_events_p1_payments.sql. Validation is server-side; the UI only mirrors it.
 */
require_once __DIR__ . '/EventsSettings.php';

class LegalInfo {
    const FIELDS = [
        'legal_name', 'legal_form', 'siret', 'vat_number', 'vat_regime', 'vat_default_bp',
        'address_line1', 'address_line2', 'postal_code', 'city', 'country',
        'legal_email', 'public_phone',
    ];

    const MAX_LEN = [
        'legal_name' => 190, 'legal_form' => 60, 'siret' => 20, 'vat_number' => 20,
        'address_line1' => 190, 'address_line2' => 190, 'postal_code' => 20, 'city' => 120,
        'legal_email' => 190, 'public_phone' => 50,
    ];

    /** Columns to SELECT for a full legal-info read. */
    public static function columns(): string {
        return implode(', ', self::FIELDS) . ', vat_valid, vat_checked_at, slug,
                events_terms_version, events_terms_accepted_at';
    }

    /**
     * Normalise + validate a submitted form. Returns [$clean, $errors] where
     * $errors maps field => error code (the UI translates codes).
     */
    public static function validate(array $in): array {
        $clean = [];
        $errors = [];
        foreach (self::MAX_LEN as $k => $max) {
            $v = isset($in[$k]) ? trim((string)$in[$k]) : '';
            $v = preg_replace('/\s+/u', ' ', $v);
            $clean[$k] = $v === '' ? null : mb_substr($v, 0, $max);
        }

        $country = strtoupper(trim((string)($in['country'] ?? '')));
        $clean['country'] = $country === '' ? null : $country;
        $clean['vat_regime'] = ($in['vat_regime'] ?? 'subject') === 'exempt' ? 'exempt' : 'subject';
        $bp = (int)($in['vat_default_bp'] ?? 2000);
        $clean['vat_default_bp'] = max(0, min(3000, $bp));

        // Identifiers: keep digits / letters only.
        if ($clean['siret'] !== null) $clean['siret'] = preg_replace('/\D/', '', $clean['siret']);
        if ($clean['vat_number'] !== null) $clean['vat_number'] = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', $clean['vat_number']));
        if ($clean['legal_email'] !== null) $clean['legal_email'] = strtolower($clean['legal_email']);

        foreach (['legal_name', 'address_line1', 'postal_code', 'city', 'legal_email'] as $req) {
            if ($clean[$req] === null) $errors[$req] = 'required';
        }
        if ($clean['country'] === null) {
            $errors['country'] = 'required';
        } elseif (!in_array($clean['country'], EventsSettings::COUNTRIES, true)) {
            $errors['country'] = 'unsupported_country';
        }
        if ($clean['legal_email'] !== null && !filter_var($clean['legal_email'], FILTER_VALIDATE_EMAIL)) {
            $errors['legal_email'] = 'invalid_email';
        }

        if ($clean['country'] === 'FR') {
            if ($clean['siret'] === null) {
                $errors['siret'] = 'required';
            } elseif (!self::siretValid($clean['siret'])) {
                $errors['siret'] = 'invalid_siret';
            }
        }

        if ($clean['vat_regime'] === 'subject' && $clean['vat_number'] === null) {
            $errors['vat_number'] = 'required_when_subject';
        }
        if ($clean['vat_number'] !== null) {
            $err = self::vatFormatError($clean['vat_number'], $clean['country'], $clean['siret']);
            if ($err) $errors['vat_number'] = $err;
        }
        if ($clean['vat_regime'] === 'exempt') {
            $clean['vat_default_bp'] = 0;
        }
        return [$clean, $errors];
    }

    /** French SIRET: 14 digits, Luhn; La Poste (SIREN 356000000) uses digit sum % 5. */
    public static function siretValid(string $siret): bool {
        if (!preg_match('/^\d{14}$/', $siret)) return false;
        if (substr($siret, 0, 9) === '356000000' && array_sum(str_split($siret)) % 5 === 0) {
            return true; // La Poste establishments (older ones also pass the Luhn check below)
        }
        $sum = 0;
        for ($i = 0; $i < 14; $i++) {
            $d = (int)$siret[$i];
            if ($i % 2 === 0) { // positions 1,3,5... from the left are doubled (14-digit Luhn)
                $d *= 2;
                if ($d > 9) $d -= 9;
            }
            $sum += $d;
        }
        return $sum % 10 === 0;
    }

    /** Format check for an EU VAT number. Greece uses the "EL" prefix. */
    public static function vatFormatError(string $vat, ?string $country, ?string $siret): ?string {
        if (!preg_match('/^([A-Z]{2})([0-9A-Z]{2,13})$/', $vat, $m)) return 'invalid_vat';
        $prefix = $m[1];
        $expected = $country === 'GR' ? 'EL' : $country;
        if ($expected && $prefix !== $expected) return 'vat_country_mismatch';
        if ($prefix === 'FR') {
            // FR + 2-char key + 9-digit SIREN. Numeric key = (12 + 3 * (SIREN mod 97)) mod 97.
            if (!preg_match('/^FR([0-9A-Z]{2})(\d{9})$/', $vat, $f)) return 'invalid_vat';
            if (ctype_digit($f[1])) {
                $key = (12 + 3 * ((int)$f[2] % 97)) % 97;
                if ((int)$f[1] !== $key) return 'invalid_vat';
            }
            if ($siret && strlen($siret) === 14 && substr($siret, 0, 9) !== $f[2]) return 'vat_siret_mismatch';
        }
        return null;
    }

    /**
     * Ask the EU VIES service whether a VAT number is valid. Returns true/false,
     * or null when VIES is unreachable (it often is): callers keep NULL and let
     * the admin re-check later. Never blocks a save.
     */
    public static function viesCheck(string $vat): ?bool {
        if (!preg_match('/^([A-Z]{2})([0-9A-Z]{2,13})$/', $vat, $m)) return false;
        $url = 'https://ec.europa.eu/taxation_customs/vies/rest-api/ms/' . $m[1] . '/vat/' . $m[2];
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 6,
            CURLOPT_CONNECTTIMEOUT => 4,
            CURLOPT_HTTPHEADER => ['Accept: application/json'],
        ]);
        $body = curl_exec($ch);
        $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        if ($body === false || $code !== 200) return null;
        $json = json_decode($body, true);
        if (!is_array($json) || !array_key_exists('isValid', $json)) return null;
        // userError other than VALID/INVALID (MS_UNAVAILABLE, TIMEOUT...) = unknown.
        $ue = $json['userError'] ?? 'VALID';
        if (!in_array($ue, ['VALID', 'INVALID'], true)) return null;
        return (bool)$json['isValid'];
    }

    /**
     * Fields still missing before the licensee can connect Stripe / publish.
     * Re-runs validate() on the stored row so stale rows are judged by today's rules.
     */
    public static function missing(array $row): array {
        [, $errors] = self::validate($row);
        return array_keys($errors);
    }

    /** Shape a DB row for the API. */
    public static function toApi(?array $row): array {
        $out = [];
        foreach (self::FIELDS as $f) $out[$f] = $row[$f] ?? null;
        $out['vat_regime'] = ($row['vat_regime'] ?? 'subject') === 'exempt' ? 'exempt' : 'subject';
        $out['vat_default_bp'] = isset($row['vat_default_bp']) ? (int)$row['vat_default_bp'] : 2000;
        $out['vat_valid'] = isset($row['vat_valid']) ? (bool)$row['vat_valid'] : null;
        $out['vat_checked_at'] = $row['vat_checked_at'] ?? null;
        return $out;
    }
}
