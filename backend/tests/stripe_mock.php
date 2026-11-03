<?php
// LOCAL TEST ONLY: a tiny fake of the Stripe endpoints Events uses, so the paid
// flow can be tested without a Stripe account. Run with PHP's built-in server:
//   php -S 127.0.0.1:12111 backend/tests/stripe_mock.php
// and set 'stripe_api_base' => 'http://127.0.0.1:12111' (+ any sk_test_ key) in
// config/payments.php (only honoured on Windows). Every request is appended to
// sys_get_temp_dir()/stripe_mock_log.jsonl for assertions.

$method = $_SERVER['REQUEST_METHOD'];
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
parse_str((string)file_get_contents('php://input'), $params);
$account = $_SERVER['HTTP_STRIPE_ACCOUNT'] ?? null;
$log = sys_get_temp_dir() . '/stripe_mock_log.jsonl';
$state = sys_get_temp_dir() . '/stripe_mock_state.json';
file_put_contents($log, json_encode(['method' => $method, 'path' => $path, 'account' => $account, 'params' => $params]) . "\n", FILE_APPEND);
$st = is_file($state) ? (json_decode(file_get_contents($state), true) ?: []) : [];

header('Content-Type: application/json');
header('Request-Id: req_mock');

function out(array $o): void {
    echo json_encode($o);
    exit;
}

if ($method === 'POST' && $path === '/v1/checkout/sessions') {
    $id = 'cs_test_' . bin2hex(random_bytes(8));
    $st[$id] = ['client_reference_id' => $params['client_reference_id'] ?? null, 'paid' => false, 'status' => 'open',
                'payment_intent' => 'pi_' . bin2hex(random_bytes(8)), 'amount_total' => 0];
    foreach ($params['line_items'] ?? [] as $l) $st[$id]['amount_total'] += (int)$l['price_data']['unit_amount'] * (int)$l['quantity'];
    file_put_contents($state, json_encode($st));
    out(['id' => $id, 'object' => 'checkout.session', 'url' => "https://checkout.stripe.test/c/pay/$id", 'payment_status' => 'unpaid',
         'status' => 'open', 'client_reference_id' => $params['client_reference_id'] ?? null, 'amount_total' => $st[$id]['amount_total']]);
}

if (preg_match('#^/v1/checkout/sessions/([^/]+)(/expire)?$#', $path, $m)) {
    $id = $m[1];
    $s = $st[$id] ?? null;
    if (!$s) { http_response_code(404); out(['error' => ['type' => 'invalid_request_error', 'message' => 'No such session']]); }
    if (!empty($m[2])) {
        if ($s['paid']) { http_response_code(400); out(['error' => ['type' => 'invalid_request_error', 'message' => 'Session is complete']]); }
        $st[$id]['status'] = 'expired';
        file_put_contents($state, json_encode($st));
        $s = $st[$id];
    }
    out(['id' => $id, 'object' => 'checkout.session', 'payment_status' => $s['paid'] ? 'paid' : 'unpaid', 'status' => $s['paid'] ? 'complete' : $s['status'],
         'payment_intent' => $s['payment_intent'], 'client_reference_id' => $s['client_reference_id'], 'amount_total' => $s['amount_total']]);
}

// Test helper (not a Stripe endpoint): mark a session as paid.
if ($method === 'POST' && preg_match('#^/_test/pay/([^/]+)$#', $path, $m)) {
    $st[$m[1]]['paid'] = true;
    $st[$m[1]]['status'] = 'complete';
    file_put_contents($state, json_encode($st));
    out(['ok' => true, 'payment_intent' => $st[$m[1]]['payment_intent']]);
}

if ($method === 'POST' && $path === '/v1/refunds') {
    out(['id' => 're_' . bin2hex(random_bytes(8)), 'object' => 'refund', 'amount' => (int)($params['amount'] ?? 0),
         'payment_intent' => $params['payment_intent'] ?? null, 'status' => 'succeeded']);
}

http_response_code(404);
out(['error' => ['type' => 'invalid_request_error', 'message' => "mock: no route for $method $path"]]);
