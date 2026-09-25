<?php
/**
 * Admin login tokens.
 *
 * A token is  <payload>.<signature>  where payload is base64url JSON and the
 * signature is HMAC-SHA256 of that payload using AUTH_SECRET. Nothing is
 * stored server side, so there is no sessions table to maintain; changing
 * AUTH_SECRET invalidates every token that is still out there.
 */
// BUILD: 2026-09-21-shop -- ping.php looks for this line to spot a stale upload.
require_once __DIR__ . '/config.php';

function b64url_encode(string $raw): string {
    return rtrim(strtr(base64_encode($raw), '+/', '-_'), '=');
}

function b64url_decode(string $enc): string {
    return (string)base64_decode(strtr($enc, '-_', '+/'), true);
}

/** Checks a username/password pair against config.php. */
function admin_credentials_ok(string $username, string $password): bool {
    if (!hash_equals(ADMIN_USERNAME, $username)) return false;

    if (ADMIN_PASSWORD_HASH !== '') {
        return password_verify($password, ADMIN_PASSWORD_HASH);
    }
    return ADMIN_PASSWORD !== '' && hash_equals(ADMIN_PASSWORD, $password);
}

function make_token(string $username): array {
    $expires = time() + AUTH_TTL;
    $payload = b64url_encode(json_encode(['u' => $username, 'exp' => $expires]));
    $sig     = b64url_encode(hash_hmac('sha256', $payload, AUTH_SECRET, true));

    return ['token' => $payload . '.' . $sig, 'expires_at' => $expires];
}

/** Returns the username inside a valid token, or null. */
function token_username(string $token): ?string {
    $parts = explode('.', $token);
    if (count($parts) !== 2) return null;

    [$payload, $sig] = $parts;
    $expected = b64url_encode(hash_hmac('sha256', $payload, AUTH_SECRET, true));
    if (!hash_equals($expected, $sig)) return null;

    $data = json_decode(b64url_decode($payload), true);
    if (!is_array($data) || !isset($data['u'], $data['exp'])) return null;
    if ((int)$data['exp'] < time()) return null;

    return (string)$data['u'];
}

/**
 * The admin token the phone sent.
 *
 * Freehostia (and most shared hosting) runs PHP as CGI/FastCGI, and Apache
 * drops the Authorization header before PHP ever sees it -- so a perfectly
 * good login looked "expired" on every upload. The app therefore sends the
 * token twice: the standard "Authorization: Bearer <token>" and a copy in
 * X-Auth-Token, a custom header no host strips (the same reason X-Api-Key has
 * always worked). Every known hiding place is checked here, best first.
 */
function bearer_token(): string {
    $candidates = [];

    // REDIRECT_ prefix appears when the .htaccess rewrite hands the header back.
    foreach (['HTTP_AUTHORIZATION', 'REDIRECT_HTTP_AUTHORIZATION'] as $key) {
        if (!empty($_SERVER[$key])) $candidates[] = (string)$_SERVER[$key];
    }

    $all = [];
    if (function_exists('getallheaders')) {
        $all = getallheaders();
    } elseif (function_exists('apache_request_headers')) {
        $all = apache_request_headers();
    }
    foreach ((array)$all as $name => $value) {
        if (strcasecmp((string)$name, 'Authorization') === 0) $candidates[] = (string)$value;
    }

    // The reliable path on hosts that strip Authorization.
    $candidates[] = (string)($_SERVER['HTTP_X_AUTH_TOKEN'] ?? '');

    foreach ($candidates as $raw) {
        $raw = trim($raw);
        if ($raw === '') continue;
        if (stripos($raw, 'Bearer ') === 0) $raw = trim(substr($raw, 7));
        // Our tokens are exactly <payload>.<signature>; ignore anything else
        // (a "Basic ..." header, for instance) so a later candidate still gets
        // its turn.
        if (substr_count($raw, '.') === 1) return $raw;
    }

    return '';
}

/**
 * Which headers actually reached PHP. ping.php prints this so a broken host
 * can be spotted in a browser without guessing. Booleans only -- it must never
 * echo the token itself.
 */
function auth_diagnostics(): array {
    $authVisible = !empty($_SERVER['HTTP_AUTHORIZATION'])
        || !empty($_SERVER['REDIRECT_HTTP_AUTHORIZATION']);

    return [
        'authorization_header_reaches_php' => $authVisible,
        'x_auth_token_header_seen'         => !empty($_SERVER['HTTP_X_AUTH_TOKEN']),
        'token_accepted'                   => token_username(bearer_token()) !== null,
    ];
}

/** Stops the request with 401 unless a valid admin token was sent. */
function require_admin(): string {
    $user = token_username(bearer_token());
    if ($user === null) {
        fail(401, 'Admin login required');
    }
    return $user;
}
