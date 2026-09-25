<?php
// BUILD: 2026-09-21-shop -- ping.php looks for this line to spot a stale upload.
require_once __DIR__ . '/config.php';

/** CORS + JSON headers. Answers the browser preflight and exits. */
function boot(array $methods): void {
    header('Content-Type: application/json; charset=utf-8');
    header('Access-Control-Allow-Origin: *');
    // X-Auth-Token is the fallback copy of the login token (see auth.php). A
    // browser refuses to send a header the preflight did not allow, so leaving
    // it out here breaks the admin site whenever it is served from a different
    // origin than the API -- the phone never preflights, which is why this went
    // unnoticed.
    header('Access-Control-Allow-Headers: Content-Type, X-Api-Key, Authorization, X-Auth-Token');
    header('Access-Control-Allow-Methods: ' . implode(', ', $methods) . ', OPTIONS');

    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        http_response_code(204);
        exit;
    }
    if (!in_array($_SERVER['REQUEST_METHOD'], $methods, true)) {
        fail(405, 'Method not allowed');
    }
    require_api_key();
}

function require_api_key(): void {
    $sent = $_SERVER['HTTP_X_API_KEY'] ?? '';
    if (!hash_equals(API_KEY, $sent)) {
        fail(401, 'Invalid or missing API key');
    }
}

/** Body of a POST/PUT, whether sent as JSON or as a form. */
function body(): array {
    $raw = file_get_contents('php://input');
    $json = json_decode($raw, true);
    if (is_array($json)) return $json;
    parse_str($raw, $form);
    return is_array($form) ? $form : [];
}

function ok($data, int $code = 200): void {
    http_response_code($code);
    echo json_encode(['ok' => true, 'data' => $data], JSON_UNESCAPED_UNICODE);
    exit;
}

function fail(int $code, string $message, $extra = null): void {
    http_response_code($code);
    echo json_encode(['ok' => false, 'error' => $message, 'details' => $extra]);
    exit;
}

/**
 * Validates and normalises a medicine payload.
 * $partial = true for PUT, where only the sent fields are checked.
 * Returns [cleanFields, errors].
 */
function validate_medicine(array $in, bool $partial = false): array {
    $errors = [];
    $out    = [];

    $has = fn(string $k) => array_key_exists($k, $in);

    if (!$partial || $has('name')) {
        $name = trim((string)($in['name'] ?? ''));
        if ($name === '')            $errors['name'] = 'Name is required';
        elseif (mb_strlen($name) > 120) $errors['name'] = 'Name is too long (max 120)';
        else                          $out['name'] = $name;
    }

    foreach (['brand' => 120, 'dosage' => 60, 'form' => 40, 'category' => 60] as $field => $max) {
        if ($has($field)) {
            $v = trim((string)$in[$field]);
            if (mb_strlen($v) > $max) $errors[$field] = "Too long (max $max)";
            else $out[$field] = $v === '' ? null : $v;
        }
    }

    if (!$partial || $has('quantity')) {
        $q = $in['quantity'] ?? 0;
        if (!is_numeric($q) || (int)$q < 0) $errors['quantity'] = 'Quantity must be 0 or more';
        else $out['quantity'] = (int)$q;
    }

    if (!$partial || $has('price')) {
        $p = $in['price'] ?? 0;
        if (!is_numeric($p) || (float)$p < 0) $errors['price'] = 'Price must be 0 or more';
        else $out['price'] = round((float)$p, 2);
    }

    if ($has('expiry_date')) {
        $d = trim((string)$in['expiry_date']);
        if ($d === '') {
            $out['expiry_date'] = null;
        } else {
            $parsed = DateTime::createFromFormat('Y-m-d', $d);
            if (!$parsed || $parsed->format('Y-m-d') !== $d) $errors['expiry_date'] = 'Use format YYYY-MM-DD';
            else $out['expiry_date'] = $d;
        }
    }

    if ($has('image_url')) {
        $u = trim((string)$in['image_url']);
        if ($u === '') {
            $out['image_url'] = null;
        } elseif (mb_strlen($u) > 255) {
            $errors['image_url'] = 'Image link is too long (max 255)';
        } elseif (!preg_match('~^https?://~i', $u) && !preg_match('~^uploads/[A-Za-z0-9._-]+$~', $u)) {
            // Either a full link the admin pasted, or a file upload.php just saved.
            $errors['image_url'] = 'Image link must start with http:// or https://';
        } else {
            $out['image_url'] = $u;
        }
    }

    if ($has('notes')) {
        $n = trim((string)$in['notes']);
        $out['notes'] = $n === '' ? null : $n;
    }

    return [$out, $errors];
}
