<?php
// Commandes - equipment sale + rental order requests (no online payment).
// Memory: project_studio_commandes_equipment_orders. Tables: add_orders_equipment.sql.
//
// Licensee token:
//   GET  catalog                          -> {categories, products, profile}
//   POST submit {kind, lang, lines:[{product_id, quantity}], rent_start?, rent_end?, pickup_mode?, return_mode?,
//                company, contact_name, contact_email, contact_phone, address_line1, address_line2, postal_code, city, country, message}
//   GET  my_requests                      -> {requests}
//   GET  my_request&id                    -> {request}
//   POST cancel {id}                      (only while status = new)
// Admin token:
//   GET  admin_products                   -> {products, categories}
//   POST product_save {id?, ...}          -> {product}
//   POST product_delete {id}              (soft)
//   POST product_upload multipart {file}  -> {file, url}
//   POST category_save {id?, name_i18n, sort_order} -> {category}
//   POST category_delete {id}             (soft; products fall back to "no category")
//   GET  admin_requests&kind&status?      -> {requests}
//   GET  admin_request&id                 -> {request}
//   POST admin_request_update {id, lines:[{id?, product_id?, sku, name, unit_price_cents, quantity}], rent_start?, rent_end?}
//   POST admin_request_status {id, status, note?, notify}
//   GET  settings                         -> {notify_emails}
//   POST settings_save {notify_emails}
//   GET  access                           -> {all, client_ids, clients:[{id, name, email}]}
//   POST access_save {all, client_ids}    (who may order; catalog/submit -> 403 orders_disabled otherwise)

require_once __DIR__ . '/../utils/cors.php';
setCorsHeaders();

header('Content-Type: application/json');
header('Cache-Control: no-store');
ini_set('display_errors', '0');

require_once __DIR__ . '/../database/Database.php';
require_once __DIR__ . '/../utils/Logger.php';
require_once __DIR__ . '/../utils/TokenManager.php';
require_once __DIR__ . '/../utils/Orders.php';
require_once __DIR__ . '/../utils/ClientAddresses.php';
require_once __DIR__ . '/../utils/OrdersAccess.php';

function jsonResponse($data, $statusCode = 200) {
    http_response_code($statusCode);
    echo json_encode($data);
    exit;
}

function fail(string $code, int $status = 422, array $extra = []): void {
    jsonResponse(['error' => $code] + $extra, $status);
}

function getRequestData(): array {
    $raw = file_get_contents('php://input');
    if ($raw === '' || $raw === false) return [];
    $data = json_decode($raw, true);
    if (!is_array($data)) fail('invalid_json', 400);
    return $data;
}

/** ['actor' => admin|client, 'id' => admin id | client id] */
function requireActor($db): array {
    $header = $_SERVER['HTTP_X_AUTH_TOKEN'] ?? $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (strpos($header, 'Bearer ') === 0) $header = substr($header, 7);
    $tokenData = $header !== '' ? TokenManager::validateToken($db, $header) : null;
    if (!$tokenData) fail('Unauthorized', 401);
    if (($tokenData['user_type'] ?? '') === 'admin') return ['actor' => 'admin', 'id' => (int)$tokenData['user_id']];
    if (!empty($tokenData['device_id']) || ($tokenData['user_type'] ?? '') !== 'client') fail('Forbidden', 403);
    return ['actor' => 'client', 'id' => (int)$tokenData['user_id']];
}

function str($v, int $max): ?string {
    if (!is_string($v) && !is_numeric($v)) return null;
    $s = trim((string)$v);
    return $s === '' ? null : mb_substr($s, 0, $max);
}

function cents($v): ?int {
    if ($v === null || $v === '' || !is_numeric($v)) return null;
    $n = (int)round((float)$v);
    return $n >= 0 && $n <= 100000000 ? $n : null;
}

function validDate($v): ?string {
    if (!is_string($v)) return null;
    $d = DateTime::createFromFormat('!Y-m-d', $v);
    return $d && $d->format('Y-m-d') === $v ? $v : null;
}

function clientRow($db, int $id): array {
    $c = $db->fetch('SELECT * FROM clients WHERE id = ?', [$id]);
    if (!$c) fail('not_found', 404);
    return $c;
}

function requestRow($db, int $id): array {
    $r = $id > 0 ? $db->fetch(
        "SELECT r.*, COALESCE(NULLIF(c.company, ''), NULLIF(c.name, ''), c.email) AS client_name
           FROM order_requests r LEFT JOIN clients c ON c.id = r.client_id WHERE r.id = ?", [$id]) : null;
    if (!$r) fail('not_found', 404);
    return $r;
}

function productSave($db, array $d): array {
    $id = (int)($d['id'] ?? 0);
    $name = Orders::cleanI18n($d['name_i18n'] ?? [], 190);
    $errors = [];
    if (!$name['fr']) $errors['name_i18n'] = 'required';
    $sale = !empty($d['sale_enabled']);
    $rent = !empty($d['rent_enabled']);
    if (!$sale && !$rent) $errors['mode'] = 'one_required';
    // Variants: own label, SKU, sale price / rental price (NULL = not offered that way), optional photo.
    $variants = [];
    foreach (is_array($d['variants'] ?? null) ? array_values($d['variants']) : [] as $i => $v) {
        if (!is_array($v)) continue;
        $label = Orders::cleanI18n($v['label_i18n'] ?? [], 120);
        if (!$label['fr']) $errors['variants'] = 'label_required';
        $img = is_array($v['image'] ?? null) ? ($v['image']['file'] ?? null) : ($v['image'] ?? null);
        if (!is_string($img) || !validMediaFile($img)) $img = null;
        $variants[] = [
            'id' => (int)($v['id'] ?? 0), 'label' => $label, 'sku' => str($v['sku'] ?? null, 60),
            'sale' => cents($v['sale_price_cents'] ?? null), 'rent' => cents($v['rent_price_cents_per_day'] ?? null),
            'image' => $img, 'sort' => $i,
        ];
    }
    if ($variants) {
        // Product-level prices are unused when variants exist.
        $salePrice = $rentPrice = null;
        if ($sale && !array_filter($variants, fn($v) => $v['sale'] !== null)) $errors['sale_price_cents'] = 'variant_price_required';
        if ($rent && !array_filter($variants, fn($v) => $v['rent'] !== null)) $errors['rent_price_cents_per_day'] = 'variant_price_required';
    } else {
        $salePrice = cents($d['sale_price_cents'] ?? null);
        $rentPrice = cents($d['rent_price_cents_per_day'] ?? null);
        if ($sale && $salePrice === null) $errors['sale_price_cents'] = 'required';
        if ($rent && $rentPrice === null) $errors['rent_price_cents_per_day'] = 'required';
    }
    $categoryId = !empty($d['category_id']) ? (int)$d['category_id'] : null;
    if ($categoryId && !$db->fetch('SELECT id FROM order_product_categories WHERE id = ? AND deleted_at IS NULL', [$categoryId])) {
        $errors['category_id'] = 'invalid';
    }
    if ($errors) fail('validation', 422, ['errors' => $errors]);

    $apps = array_values(array_intersect(Orders::APPS, is_array($d['apps'] ?? null) ? $d['apps'] : []));
    $images = [];
    foreach (is_array($d['images'] ?? null) ? $d['images'] : [] as $f) {
        $f = is_array($f) ? ($f['file'] ?? '') : $f;
        if (is_string($f) && validMediaFile($f)) $images[] = $f;
    }
    $vals = [
        str($d['sku'] ?? null, 60),
        $categoryId,
        json_encode($name, JSON_UNESCAPED_UNICODE),
        $sale ? 1 : 0, $salePrice,
        json_encode(Orders::cleanI18n($d['sale_description_i18n'] ?? [], 8000), JSON_UNESCAPED_UNICODE),
        $rent ? 1 : 0, $rentPrice,
        json_encode(Orders::cleanI18n($d['rent_description_i18n'] ?? [], 8000), JSON_UNESCAPED_UNICODE),
        json_encode($apps),
        json_encode(array_values(array_unique($images))),
        array_key_exists('visible', $d) ? (!empty($d['visible']) ? 1 : 0) : 1,
        (int)($d['sort_order'] ?? 0),
    ];
    $cols = 'sku = ?, category_id = ?, name_i18n = ?, sale_enabled = ?, sale_price_cents = ?, sale_description_i18n = ?,
             rent_enabled = ?, rent_price_cents_per_day = ?, rent_description_i18n = ?, apps = ?, images = ?, visible = ?, sort_order = ?';
    $db->begin();
    if ($id > 0) {
        if (!$db->fetch('SELECT id FROM order_products WHERE id = ? AND deleted_at IS NULL', [$id])) fail('not_found', 404);
        $db->execute("UPDATE order_products SET $cols WHERE id = ?", array_merge($vals, [$id]));
    } else {
        $db->execute("INSERT INTO order_products SET $cols", $vals);
        $id = (int)$db->lastInsertId();
    }
    // Upsert variants; the ones no longer listed are soft-deleted (old request lines keep their copy).
    $existing = array_map('intval', array_column($db->fetchAll('SELECT id FROM order_product_variants WHERE product_id = ? AND deleted_at IS NULL', [$id]), 'id'));
    $kept = [];
    foreach ($variants as $v) {
        $vv = [json_encode($v['label'], JSON_UNESCAPED_UNICODE), $v['sku'], $v['sale'], $v['rent'], $v['image'], $v['sort']];
        if ($v['id'] && in_array($v['id'], $existing, true)) {
            $db->execute('UPDATE order_product_variants SET label_i18n = ?, sku = ?, sale_price_cents = ?, rent_price_cents_per_day = ?, image = ?, sort_order = ? WHERE id = ?', array_merge($vv, [$v['id']]));
            $kept[] = $v['id'];
        } else {
            $db->execute('INSERT INTO order_product_variants (label_i18n, sku, sale_price_cents, rent_price_cents_per_day, image, sort_order, product_id) VALUES (?, ?, ?, ?, ?, ?, ?)', array_merge($vv, [$id]));
        }
    }
    foreach (array_diff($existing, $kept) as $gone) {
        $db->execute('UPDATE order_product_variants SET deleted_at = NOW() WHERE id = ?', [$gone]);
    }
    $db->commit();
    return Orders::productsOut($db, [$db->fetch('SELECT * FROM order_products WHERE id = ?', [$id])])[0];
}

function validMediaFile(string $f): bool {
    return (bool)preg_match('/^[a-z0-9_]+\.(png|jpg)$/', $f) && is_file(Orders::mediaDir() . '/' . $f);
}

function handleProductUpload(): array {
    $f = $_FILES['file'] ?? null;
    if (!$f || $f['error'] !== UPLOAD_ERR_OK) fail('no_file');
    if ($f['size'] > 8 * 1024 * 1024) fail('file_too_large');
    $dir = Orders::mediaDir();
    if (!is_dir($dir) && !mkdir($dir, 0755, true) && !is_dir($dir)) fail('storage_error', 500);
    // Decoded and re-encoded with GD (drops metadata / anything not pixels). No SVG.
    $info = @getimagesize($f['tmp_name']);
    $mime = $info['mime'] ?? '';
    $src = match ($mime) {
        'image/png' => @imagecreatefrompng($f['tmp_name']),
        'image/jpeg' => @imagecreatefromjpeg($f['tmp_name']),
        'image/webp' => function_exists('imagecreatefromwebp') ? @imagecreatefromwebp($f['tmp_name']) : false,
        default => false,
    };
    if (!$src) fail('invalid_image');
    $w = imagesx($src);
    $h = imagesy($src);
    $scale = min(1, 1600 / max($w, $h));
    $nw = max(1, (int)round($w * $scale));
    $nh = max(1, (int)round($h * $scale));
    $dst = imagecreatetruecolor($nw, $nh);
    $keepAlpha = $mime !== 'image/jpeg';
    if ($keepAlpha) {
        imagealphablending($dst, false);
        imagesavealpha($dst, true);
        imagefill($dst, 0, 0, imagecolorallocatealpha($dst, 0, 0, 0, 127));
    }
    imagecopyresampled($dst, $src, 0, 0, 0, 0, $nw, $nh, $w, $h);
    $name = 'product_' . gmdate('YmdHis') . '_' . bin2hex(random_bytes(4));
    if ($keepAlpha) {
        $name .= '.png';
        $ok = imagepng($dst, "$dir/$name", 6);
    } else {
        $name .= '.jpg';
        $ok = imagejpeg($dst, "$dir/$name", 85);
    }
    if (!$ok) fail('storage_error', 500);
    return ['file' => $name, 'url' => Orders::mediaPath($name)];
}

/** Licensee basket -> request + lines (in a transaction). */
function submitRequest($db, array $client, array $d): array {
    $kind = ($d['kind'] ?? '') === 'rent' ? 'rent' : (($d['kind'] ?? '') === 'sale' ? 'sale' : null);
    if (!$kind) fail('invalid_kind');
    $lang = Orders::lang($d['lang'] ?? $client['language'] ?? 'fr');
    $errors = [];

    $catalog = [];
    foreach (Orders::catalogForClient($db, $client) as $p) $catalog[$p['id']] = $p;
    // Keyed "productId:variantId" (variant 0 = product without variants).
    $qty = [];
    foreach (is_array($d['lines'] ?? null) ? $d['lines'] : [] as $l) {
        $pid = (int)($l['product_id'] ?? 0);
        $vid = (int)($l['variant_id'] ?? 0);
        $q = (int)($l['quantity'] ?? 0);
        if ($q <= 0) continue;
        $p = $catalog[$pid] ?? null;
        if (!$p || Orders::unitPrice($p, $kind, $vid ?: null) === null) fail('product_unavailable', 422, ['product_id' => $pid, 'variant_id' => $vid ?: null]);
        $qty["$pid:$vid"] = min(999, ($qty["$pid:$vid"] ?? 0) + $q);
    }
    if (!$qty) $errors['lines'] = 'required';

    $start = $end = $pickup = $return = null;
    if ($kind === 'rent') {
        $start = validDate($d['rent_start'] ?? null);
        $end = validDate($d['rent_end'] ?? null);
        $tomorrow = (new DateTime('tomorrow', new DateTimeZone('Europe/Paris')))->format('Y-m-d');
        if (!$start || $start < $tomorrow) $errors['rent_start'] = 'invalid';
        if (!$end || ($start && $end < $start)) $errors['rent_end'] = 'invalid';
        elseif ($start && Orders::days($start, $end) > 366) $errors['rent_end'] = 'too_long';
        $pickup = in_array($d['pickup_mode'] ?? '', Orders::MODES, true) ? $d['pickup_mode'] : null;
        $return = in_array($d['return_mode'] ?? '', Orders::MODES, true) ? $d['return_mode'] : null;
        if (!$pickup) $errors['pickup_mode'] = 'required';
        if (!$return) $errors['return_mode'] = 'required';
    }

    $contact = [
        'company' => str($d['company'] ?? null, 190),
        'contact_name' => str($d['contact_name'] ?? null, 190),
        'contact_email' => str($d['contact_email'] ?? null, 190),
        'contact_phone' => str($d['contact_phone'] ?? null, 50),
        'address_line1' => str($d['address_line1'] ?? null, 190),
        'address_line2' => str($d['address_line2'] ?? null, 190),
        'postal_code' => str($d['postal_code'] ?? null, 20),
        'city' => str($d['city'] ?? null, 120),
        'country' => ($c = strtoupper((string)str($d['country'] ?? null, 2))) && preg_match('/^[A-Z]{2}$/', $c) ? $c : null,
    ];
    if (!$contact['contact_name']) $errors['contact_name'] = 'required';
    if (!$contact['contact_email'] || !filter_var($contact['contact_email'], FILTER_VALIDATE_EMAIL)) $errors['contact_email'] = 'invalid';
    // An address is needed whenever something travels by post.
    $needsAddress = $kind === 'sale' || $pickup === 'post';
    if ($needsAddress) {
        foreach (['address_line1', 'postal_code', 'city'] as $k) if (!$contact[$k]) $errors[$k] = 'required';
    }
    if ($errors) fail('validation', 422, ['errors' => $errors]);

    $db->begin();
    $number = Orders::nextNumber($db, $kind);
    $db->execute(
        'INSERT INTO order_requests (number, kind, client_id, status, rent_start, rent_end, pickup_mode, return_mode,
            company, contact_name, contact_email, contact_phone, address_line1, address_line2, postal_code, city, country, message, language)
         VALUES (?, ?, ?, \'new\', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [$number, $kind, (int)$client['id'], $start, $end, $pickup, $return,
         $contact['company'], $contact['contact_name'], $contact['contact_email'], $contact['contact_phone'],
         $contact['address_line1'], $contact['address_line2'], $contact['postal_code'], $contact['city'], $contact['country'],
         str($d['message'] ?? null, 4000), $lang]
    );
    $rid = (int)$db->lastInsertId();
    // Billing = the licensee's main address at send time (column set only exists after add_client_shipping_address.sql).
    if (array_key_exists('shipping_same_as_main', $client)) {
        $billing = ClientAddresses::billing($client);
        $db->execute('UPDATE order_requests SET ' . implode(', ', array_map(fn($k) => "$k = ?", array_keys($billing))) . ' WHERE id = ?',
            array_merge(array_values($billing), [$rid]));
    }
    $i = 0;
    foreach ($qty as $key => $q) {
        [$pid, $vid] = array_map('intval', explode(':', $key));
        $p = $catalog[$pid];
        $variant = null;
        foreach ($p['variants'] as $v) if ($v['id'] === $vid) $variant = $v;
        // Line name = "Product – Variant" per language (falls back like the catalogue).
        $nameI18n = $p['name_i18n'];
        if ($variant) {
            foreach (Orders::LANGS as $l) {
                $nameI18n[$l] = Orders::pick($p['name_i18n'], $l) . ' – ' . Orders::pick($variant['label_i18n'], $l);
            }
        }
        $db->execute(
            'INSERT INTO order_request_lines (request_id, product_id, variant_id, sku, name, name_i18n, unit_price_cents, quantity, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [$rid, $pid, $variant ? $vid : null, ($variant['sku'] ?? null) ?: $p['sku'], mb_substr(Orders::pick($nameI18n, 'fr'), 0, 190),
             json_encode($nameI18n, JSON_UNESCAPED_UNICODE), Orders::unitPrice($p, $kind, $variant ? $vid : null), $q, $i++]
        );
    }
    Orders::logEvent($db, $rid, 'created', 'new', null, 'client', (int)$client['id']);
    $db->commit();
    return Orders::requestOut($db, requestRow($db, $rid), true, $lang);
}

/** Admin rewrites the lines (+ rental dates). Existing product lines keep their translations. */
function adminUpdateRequest($db, array $r, array $d, int $adminId): void {
    $existing = [];
    foreach ($db->fetchAll('SELECT * FROM order_request_lines WHERE request_id = ?', [$r['id']]) as $l) $existing[(int)$l['id']] = $l;
    $lines = [];
    foreach (is_array($d['lines'] ?? null) ? $d['lines'] : [] as $l) {
        $name = str($l['name'] ?? null, 190);
        $price = cents($l['unit_price_cents'] ?? null);
        $q = (int)($l['quantity'] ?? 0);
        if (!$name || $price === null || $q <= 0 || $q > 99999) fail('validation', 422, ['errors' => ['lines' => 'invalid']]);
        $old = $existing[(int)($l['id'] ?? 0)] ?? null;
        $lines[] = [
            'product_id' => $old['product_id'] ?? null,
            'variant_id' => $old['variant_id'] ?? null,
            'sku' => str($l['sku'] ?? null, 60),
            'name' => $name,
            // Keep the licensee-language snapshot only while the admin did not rename the line.
            'name_i18n' => $old && $old['name'] === $name ? $old['name_i18n'] : null,
            'unit_price_cents' => $price,
            'quantity' => $q,
        ];
    }
    if (!$lines) fail('validation', 422, ['errors' => ['lines' => 'required']]);
    $start = $r['rent_start'];
    $end = $r['rent_end'];
    if ($r['kind'] === 'rent') {
        $start = validDate($d['rent_start'] ?? null) ?? $start;
        $end = validDate($d['rent_end'] ?? null) ?? $end;
        if ($end < $start) fail('validation', 422, ['errors' => ['rent_end' => 'invalid']]);
    }
    $db->begin();
    $db->execute('DELETE FROM order_request_lines WHERE request_id = ?', [$r['id']]);
    foreach ($lines as $i => $l) {
        $db->execute(
            'INSERT INTO order_request_lines (request_id, product_id, variant_id, sku, name, name_i18n, unit_price_cents, quantity, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [$r['id'], $l['product_id'], $l['variant_id'], $l['sku'], $l['name'], $l['name_i18n'], $l['unit_price_cents'], $l['quantity'], $i]
        );
    }
    $db->execute('UPDATE order_requests SET rent_start = ?, rent_end = ? WHERE id = ?', [$start, $end, $r['id']]);
    Orders::logEvent($db, (int)$r['id'], 'edited', null, null, 'admin', $adminId);
    $db->commit();
}

try {
    $db = Database::getInstance();
    if (!Orders::migrated($db)) fail('orders_unavailable', 503);
    $ctx = requireActor($db);
    $isAdmin = $ctx['actor'] === 'admin';
    $action = $_GET['action'] ?? '';
    $method = $_SERVER['REQUEST_METHOD'];
    $data = ($method === 'POST' && $action !== 'product_upload') ? getRequestData() : [];
    $adminOnly = !in_array($action, ['catalog', 'submit', 'my_requests', 'my_request', 'cancel'], true);
    if ($adminOnly && !$isAdmin) fail('Forbidden', 403);
    if (!$adminOnly && $isAdmin) fail('Forbidden', 403);
    $uiLang = Orders::lang($_GET['lang'] ?? null);
    // Ordering switched off for this licensee: no catalogue, no new request. Past
    // requests ("Mes demandes", cancel) stay available.
    if (!$isAdmin && in_array($action, ['catalog', 'submit'], true) && !OrdersAccess::clientEnabled($db, $ctx['id'])) {
        fail('orders_disabled', 403);
    }

    switch ($action) {
        // ── Licensee ──────────────────────────────────────────────────────
        case 'catalog': {
            $c = clientRow($db, $ctx['id']);
            jsonResponse([
                'categories' => Orders::categories($db),
                'products' => Orders::catalogForClient($db, $c),
                // Delivery prefill: the account's shipping address, else its main address.
                'profile' => ClientAddresses::delivery($c) + ['contact_email' => ($c['legal_email'] ?? null) ?: $c['email']],
            ]);
        }
        case 'submit': {
            if ($method !== 'POST') fail('Method not allowed', 405);
            $c = clientRow($db, $ctx['id']);
            $out = submitRequest($db, $c, $data);
            Orders::mailSubmitted($db, $out, $c);
            Logger::log('orders', 'POST', 'submit', $ctx['id'], ['id' => $out['id'], 'number' => $out['number']], ['success' => true], 200, 'client');
            jsonResponse(['request' => $out]);
        }
        case 'my_requests': {
            $rows = $db->fetchAll('SELECT * FROM order_requests WHERE client_id = ? ORDER BY id DESC', [$ctx['id']]);
            jsonResponse(['requests' => array_map(fn($r) => Orders::requestOut($db, $r, false, $uiLang), $rows)]);
        }
        case 'my_request': {
            $r = requestRow($db, (int)($_GET['id'] ?? 0));
            if ((int)$r['client_id'] !== $ctx['id']) fail('not_found', 404);
            jsonResponse(['request' => Orders::requestOut($db, $r, true, $uiLang)]);
        }
        case 'cancel': {
            $r = requestRow($db, (int)($data['id'] ?? 0));
            if ((int)$r['client_id'] !== $ctx['id']) fail('not_found', 404);
            if ($r['status'] !== 'new') fail('not_cancellable');
            $db->execute("UPDATE order_requests SET status = 'cancelled' WHERE id = ?", [$r['id']]);
            Orders::logEvent($db, (int)$r['id'], 'status', 'cancelled', null, 'client', $ctx['id']);
            $out = Orders::requestOut($db, requestRow($db, (int)$r['id']), true, $uiLang);
            Orders::mailCancelledByClient($db, $out, clientRow($db, $ctx['id']));
            jsonResponse(['request' => $out]);
        }

        // ── Admin: catalogue ──────────────────────────────────────────────
        case 'admin_products': {
            jsonResponse([
                'products' => Orders::productsOut($db, $db->fetchAll('SELECT * FROM order_products WHERE deleted_at IS NULL ORDER BY sort_order, id')),
                'categories' => Orders::categories($db),
            ]);
        }
        case 'product_save': {
            $p = productSave($db, $data);
            Logger::log('orders', 'POST', 'product_save', $ctx['id'], ['id' => $p['id']], ['success' => true], 200);
            jsonResponse(['product' => $p]);
        }
        case 'product_delete': {
            $db->execute('UPDATE order_products SET deleted_at = NOW() WHERE id = ? AND deleted_at IS NULL', [(int)($data['id'] ?? 0)]);
            jsonResponse(['ok' => true]);
        }
        case 'product_upload': {
            if ($method !== 'POST') fail('Method not allowed', 405);
            jsonResponse(handleProductUpload());
        }
        case 'category_save': {
            $id = (int)($data['id'] ?? 0);
            $name = Orders::cleanI18n($data['name_i18n'] ?? [], 120);
            if (!$name['fr']) fail('validation', 422, ['errors' => ['name_i18n' => 'required']]);
            $vals = [json_encode($name, JSON_UNESCAPED_UNICODE), (int)($data['sort_order'] ?? 0)];
            if ($id > 0) {
                $db->execute('UPDATE order_product_categories SET name_i18n = ?, sort_order = ? WHERE id = ? AND deleted_at IS NULL', array_merge($vals, [$id]));
            } else {
                $db->execute('INSERT INTO order_product_categories (name_i18n, sort_order) VALUES (?, ?)', $vals);
                $id = (int)$db->lastInsertId();
            }
            $row = $db->fetch('SELECT * FROM order_product_categories WHERE id = ? AND deleted_at IS NULL', [$id]);
            if (!$row) fail('not_found', 404);
            jsonResponse(['category' => Orders::categoryOut($row)]);
        }
        case 'category_delete': {
            $id = (int)($data['id'] ?? 0);
            $db->execute('UPDATE order_product_categories SET deleted_at = NOW() WHERE id = ?', [$id]);
            $db->execute('UPDATE order_products SET category_id = NULL WHERE category_id = ?', [$id]);
            jsonResponse(['ok' => true]);
        }

        // ── Admin: requests ───────────────────────────────────────────────
        case 'admin_requests': {
            $kind = ($_GET['kind'] ?? '') === 'rent' ? 'rent' : 'sale';
            $status = $_GET['status'] ?? '';
            $sql = "SELECT r.*, COALESCE(NULLIF(c.company, ''), NULLIF(c.name, ''), c.email) AS client_name
                      FROM order_requests r LEFT JOIN clients c ON c.id = r.client_id WHERE r.kind = ?";
            $params = [$kind];
            if (in_array($status, Orders::STATUSES, true)) {
                $sql .= ' AND r.status = ?';
                $params[] = $status;
            }
            // Rentals: soonest start first so overlaps are easy to spot; sales: newest first.
            $sql .= $kind === 'rent' ? ' ORDER BY r.rent_start IS NULL, r.rent_start, r.id' : ' ORDER BY r.id DESC';
            $rows = $db->fetchAll($sql, $params);
            jsonResponse(['requests' => array_map(fn($r) => Orders::requestOut($db, $r, false, 'fr'), $rows)]);
        }
        case 'admin_request': {
            jsonResponse(['request' => Orders::requestOut($db, requestRow($db, (int)($_GET['id'] ?? 0)), true, 'fr')]);
        }
        case 'admin_request_update': {
            $r = requestRow($db, (int)($data['id'] ?? 0));
            adminUpdateRequest($db, $r, $data, $ctx['id']);
            jsonResponse(['request' => Orders::requestOut($db, requestRow($db, (int)$r['id']), true, 'fr')]);
        }
        case 'admin_request_status': {
            $r = requestRow($db, (int)($data['id'] ?? 0));
            $status = (string)($data['status'] ?? '');
            if (!in_array($status, Orders::STATUSES, true)) fail('invalid_status');
            $note = str($data['note'] ?? null, 4000);
            $db->execute('UPDATE order_requests SET status = ? WHERE id = ?', [$status, $r['id']]);
            Orders::logEvent($db, (int)$r['id'], 'status', $status, $note, 'admin', $ctx['id']);
            $fresh = requestRow($db, (int)$r['id']);
            $mailed = false;
            if (!empty($data['notify'])) {
                $c = $db->fetch('SELECT * FROM clients WHERE id = ?', [$r['client_id']]) ?: [];
                $licenseeView = Orders::requestOut($db, $fresh, true, Orders::lang($fresh['language']));
                Orders::mailStatus($db, $licenseeView, $c, $note);
                $mailed = true;
            }
            Logger::log('orders', 'POST', 'status', $ctx['id'], ['id' => (int)$r['id'], 'status' => $status], ['success' => true], 200);
            jsonResponse(['request' => Orders::requestOut($db, $fresh, true, 'fr'), 'mailed' => $mailed]);
        }

        // ── Admin: settings ───────────────────────────────────────────────
        case 'settings': {
            jsonResponse(['notify_emails' => Orders::notifyEmails($db)]);
        }
        case 'settings_save': {
            $emails = [];
            foreach (is_array($data['notify_emails'] ?? null) ? $data['notify_emails'] : [] as $e) {
                $e = trim((string)$e);
                if ($e === '') continue;
                if (!filter_var($e, FILTER_VALIDATE_EMAIL)) fail('validation', 422, ['errors' => ['notify_emails' => 'invalid'], 'email' => $e]);
                $emails[] = mb_strtolower($e);
            }
            $emails = array_values(array_unique($emails));
            if (!$emails) fail('validation', 422, ['errors' => ['notify_emails' => 'required']]);
            $db->execute(
                "INSERT INTO order_settings (name, value, updated_by) VALUES ('notify_emails', ?, ?)
                 ON DUPLICATE KEY UPDATE value = VALUES(value), updated_by = VALUES(updated_by)",
                [json_encode($emails), $ctx['id']]
            );
            jsonResponse(['notify_emails' => $emails]);
        }
        case 'access': {
            $clients = $db->fetchAll(
                "SELECT id, COALESCE(NULLIF(company, ''), NULLIF(name, ''), email) AS name, email FROM clients ORDER BY name"
            );
            jsonResponse(OrdersAccess::settings($db) + ['clients' => array_map(fn($c) => [
                'id' => (int)$c['id'], 'name' => $c['name'], 'email' => $c['email'],
            ], $clients)]);
        }
        case 'access_save': {
            if ($method !== 'POST') fail('Method not allowed', 405);
            $out = OrdersAccess::save($db, !empty($data['all']), is_array($data['client_ids'] ?? null) ? $data['client_ids'] : [], $ctx['id']);
            Logger::log('orders', 'POST', 'access_save', $ctx['id'], ['all' => $out['all'], 'count' => count($out['client_ids'])], ['success' => true], 200);
            jsonResponse($out);
        }

        default:
            fail('Invalid action', 400);
    }
} catch (Throwable $e) {
    if (isset($db) && $db->inTransaction()) $db->rollBack();
    error_log('[orders] ' . $e->getMessage() . ' @ ' . basename($e->getFile()) . ':' . $e->getLine());
    jsonResponse(['error' => 'Server error'], 500);
}
