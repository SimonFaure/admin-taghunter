<?php
/**
 * Stripe Connect for Events (decision 1): every licensee has its own Stripe
 * account with the full Stripe dashboard (the "Standard" model, created
 * through controller properties). Licensees are the seller of record; the
 * platform only takes an application fee on each direct charge.
 *
 * Accounts are created on demand from the licensee's legal info, onboarded
 * through Stripe-hosted Account Links, and mirrored in
 * stripe_connected_accounts (refreshed on onboarding return + account.updated).
 */
require_once __DIR__ . '/PaymentsConfig.php';

class StripeConnect {
    private static $client = null;

    /** Shared StripeClient, or null when Stripe is not configured yet. */
    public static function client() {
        if (!PaymentsConfig::stripeConfigured()) return null;
        if (self::$client === null) {
            require_once __DIR__ . '/../vendor/autoload.php';
            \Stripe\Stripe::setAppInfo('Taghunter Studio Events', null, 'https://taghunter.fr');
            // Retries are a global SDK setting (StripeClient rejects it as a config key).
            \Stripe\Stripe::setMaxNetworkRetries(2);
            $cfg = ['api_key' => (string)PaymentsConfig::get('stripe_secret_key')];
            // Local tests only: point the SDK at a fake Stripe (backend/tests/stripe_mock.php).
            $mock = (string)PaymentsConfig::get('stripe_api_base', '');
            if ($mock !== '' && stripos(PHP_OS, 'WIN') === 0) $cfg['api_base'] = $mock;
            self::$client = new \Stripe\StripeClient($cfg);
        }
        return self::$client;
    }

    public static function row($db, int $clientId): ?array {
        try {
            return $db->fetch('SELECT * FROM stripe_connected_accounts WHERE client_id = ?', [$clientId]) ?: null;
        } catch (Throwable $e) {
            return null;
        }
    }

    /**
     * Create the licensee's connected account if it does not exist yet.
     * Idempotent per licensee (Stripe idempotency key + local row check).
     */
    public static function ensureAccount($db, array $client): string {
        $existing = self::row($db, (int)$client['id']);
        if ($existing && empty($existing['disconnected_at'])) return $existing['stripe_account_id'];

        $stripe = self::client();
        if (!$stripe) throw new RuntimeException('stripe_not_configured');

        $brand = $client['legal_name'] ?: ($client['company'] ?: $client['name']);
        $params = [
            'country' => $client['country'],
            'email' => $client['legal_email'] ?: $client['email'],
            'controller' => [
                'stripe_dashboard' => ['type' => 'full'],
                'fees' => ['payer' => 'account'],
                'losses' => ['payments' => 'stripe'],
                'requirement_collection' => 'stripe',
            ],
            'business_profile' => array_filter([
                'name' => $brand,
                'mcc' => '7999', // Recreation services
                'url' => !empty($client['slug']) ? PaymentsConfig::eventsPublicBase() . '/o/' . $client['slug'] : null,
                'support_email' => $client['legal_email'] ?: null,
            ]),
            'metadata' => ['client_id' => (string)$client['id'], 'source' => 'taghunter_studio_events'],
        ];
        // A previously disconnected account gets a fresh key so Stripe creates a new one.
        $suffix = $existing ? '-' . strtotime((string)$existing['disconnected_at']) : '';
        $account = $stripe->accounts->create($params, ['idempotency_key' => 'acct-create-' . $client['id'] . $suffix]);

        $db->query(
            'INSERT INTO stripe_connected_accounts (client_id, stripe_account_id, livemode, country)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE stripe_account_id = VALUES(stripe_account_id), livemode = VALUES(livemode),
                 country = VALUES(country), charges_enabled = 0, payouts_enabled = 0, details_submitted = 0,
                 disabled_reason = NULL, requirements = NULL, disconnected_at = NULL',
            [(int)$client['id'], $account->id, PaymentsConfig::stripeLive() ? 1 : 0, $client['country']]
        );
        self::syncFromAccount($db, $account);
        return $account->id;
    }

    /** Stripe-hosted onboarding (or "update my details") link. Single use, short-lived. */
    public static function onboardingLink(string $accountId): string {
        $stripe = self::client();
        if (!$stripe) throw new RuntimeException('stripe_not_configured');
        $base = PaymentsConfig::studioBase() . '/my/payments';
        $link = $stripe->accountLinks->create([
            'account' => $accountId,
            'type' => 'account_onboarding',
            'collection_options' => ['fields' => 'eventually_due'],
            'refresh_url' => $base . '?stripe=refresh',
            'return_url' => $base . '?stripe=return',
        ]);
        return $link->url;
    }

    /** Pull the account from Stripe and mirror it locally. */
    public static function refresh($db, string $accountId): void {
        $stripe = self::client();
        if (!$stripe) return;
        self::syncFromAccount($db, $stripe->accounts->retrieve($accountId));
    }

    /** Mirror a Stripe Account object (API or webhook payload) into our row. */
    public static function syncFromAccount($db, $account): void {
        $req = $account->requirements ?? null;
        $requirements = $req ? [
            'currently_due' => $req->currently_due ?? [],
            'eventually_due' => $req->eventually_due ?? [],
            'past_due' => $req->past_due ?? [],
            'pending_verification' => $req->pending_verification ?? [],
            'current_deadline' => $req->current_deadline ?? null,
        ] : null;
        $db->query(
            'UPDATE stripe_connected_accounts
                SET charges_enabled = ?, payouts_enabled = ?, details_submitted = ?,
                    disabled_reason = ?, requirements = ?, country = COALESCE(?, country)
              WHERE stripe_account_id = ?',
            [
                !empty($account->charges_enabled) ? 1 : 0,
                !empty($account->payouts_enabled) ? 1 : 0,
                !empty($account->details_submitted) ? 1 : 0,
                $req->disabled_reason ?? null,
                $requirements ? json_encode($requirements) : null,
                $account->country ?? null,
                $account->id,
            ]
        );
    }

    /** The licensee revoked our access from their Stripe dashboard. */
    public static function markDisconnected($db, string $accountId): void {
        $db->query(
            'UPDATE stripe_connected_accounts SET disconnected_at = UTC_TIMESTAMP(), charges_enabled = 0, payouts_enabled = 0
              WHERE stripe_account_id = ? AND disconnected_at IS NULL',
            [$accountId]
        );
    }

    /** API shape for the Studio (no secrets). */
    public static function status(?array $row): array {
        $configured = PaymentsConfig::stripeConfigured();
        if (!$row) {
            return ['configured' => $configured, 'connected' => false, 'state' => 'none'];
        }
        $req = $row['requirements'] ? json_decode($row['requirements'], true) : null;
        if (!empty($row['disconnected_at'])) {
            $state = 'disconnected';
        } elseif ((int)$row['charges_enabled'] === 1) {
            $state = !empty($req['currently_due']) || !empty($req['past_due']) ? 'action_needed' : 'active';
        } elseif ((int)$row['details_submitted'] === 1) {
            $state = 'pending_verification';
        } else {
            $state = 'onboarding_incomplete';
        }
        return [
            'configured' => $configured,
            'connected' => true,
            'state' => $state,
            'account_id' => $row['stripe_account_id'],
            'livemode' => (bool)$row['livemode'],
            'charges_enabled' => (bool)$row['charges_enabled'],
            'payouts_enabled' => (bool)$row['payouts_enabled'],
            'details_submitted' => (bool)$row['details_submitted'],
            'disabled_reason' => $row['disabled_reason'],
            'requirements' => $req,
            'disconnected_at' => $row['disconnected_at'],
            'updated_at' => $row['updated_at'],
        ];
    }
}
