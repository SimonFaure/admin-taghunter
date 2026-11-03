<?php
// Events / payments secrets. Copy to config/payments.php (git-ignored, never
// overwritten on deploy) and fill in. Same OS switch as config/database.php:
// Windows = local dev (Stripe TEST keys), Linux = production (LIVE keys once
// the platform is activated; test keys until then).
//
// stripe_webhook_secrets: the "whsec_..." of every endpoint that posts to
// api/stripe_webhook.php. The Connect endpoint (events from licensees'
// accounts) is required; add the platform endpoint's secret if you create one.
// Locally: the secret printed by
//   stripe listen --forward-connect-to http://studio.taghunter.test/backend/api/stripe_webhook.php
//
// events_token_secret: 32+ random bytes, e.g. php -r "echo bin2hex(random_bytes(32));"
// Changing it invalidates every booking link already emailed.

$isWindows = stripos(PHP_OS, 'WIN') === 0;

return $isWindows
    ? [
        'stripe_secret_key' => '',          // sk_test_...
        'stripe_publishable_key' => '',     // pk_test_...
        'stripe_webhook_secrets' => [],     // ['whsec_...']
        'mailjet_api_key' => '',
        'mailjet_api_secret' => '',
        'mailjet_sandbox' => true,          // true = Mailjet validates but does not deliver
        'mail_from_email' => 'billetterie@taghunter.fr',
        'events_token_secret' => '',
        'cron_http_key' => '',
        'studio_base' => 'http://studio.taghunter.test',
        'events_public_base' => 'http://events.taghunter.test',
    ]
    : [
        'stripe_secret_key' => '',          // sk_live_... (sk_test_... until go-live)
        'stripe_publishable_key' => '',
        'stripe_webhook_secrets' => [],
        'mailjet_api_key' => '',
        'mailjet_api_secret' => '',
        'mailjet_sandbox' => false,
        'mail_from_email' => 'billetterie@taghunter.fr',
        'events_token_secret' => '',
        'cron_http_key' => '',
        'studio_base' => 'https://studio.taghunter.fr',
        'events_public_base' => 'https://events.taghunter.fr',
    ];
