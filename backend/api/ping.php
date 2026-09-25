<?php
/**
 * Health page for the MediShop API. Open it in a browser:
 *
 *   http://jaydee15.mooo.com/ping.php     (once DNS points here)
 *   http://<your PC>:8080/ping.php        (through devproxy.js)
 *
 * Every check says what is wrong and what to do about it, so a broken deploy
 * does not have to be guessed at. Add ?format=json for the machine-readable
 * version, which is what scripts and the troubleshooting steps use.
 *
 * No check may throw: each one is caught on its own so a dead database still
 * leaves the rest of the page readable.
 */
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/auth.php';

/** Bump this whenever the API contract changes, and re-upload the folder. */
define('API_BUILD', '2026-09-21-shop');

/* ---------------------------------------------------------------- checks -- */

$checks = [];

/** Records one result. $hint is only shown when the check is not ok. */
function check(string $name, ?bool $ok, string $detail, string $hint = ''): void {
    global $checks;
    $checks[] = ['name' => $name, 'ok' => $ok, 'detail' => $detail, 'hint' => $hint];
}

check('PHP', true, PHP_VERSION . ' · build ' . API_BUILD);

/* -- Are the files on the server the ones this build expects? --------------- */

$stale = [];
foreach (['auth.php', 'helpers.php', 'login.php', 'medicines.php', 'upload.php', 'orders.php'] as $file) {
    $path = __DIR__ . '/' . $file;
    if (!is_file($path)) {
        $stale[] = $file . ' (missing)';
    } elseif (strpos((string)@file_get_contents($path), 'BUILD: ' . API_BUILD) === false) {
        $stale[] = $file;
    }
}
$ht    = __DIR__ . '/.htaccess';
$htOk  = is_file($ht) && strpos((string)@file_get_contents($ht), 'HTTP_AUTHORIZATION') !== false;
if (!$htOk) $stale[] = '.htaccess';

check(
    'API files',
    count($stale) === 0,
    count($stale) === 0 ? 'All files match this build' : 'Out of date: ' . implode(', ', $stale),
    'Upload those files again from backend/api (never config.php) and reload this page.',
);

/* -- Database --------------------------------------------------------------- */

try {
    $count = (int)db()->query('SELECT COUNT(*) FROM medicines')->fetchColumn();
    $cols  = db()->query('SHOW COLUMNS FROM medicines')->fetchAll(PDO::FETCH_COLUMN);

    check('Database', true, $count . ' medicines in the catalogue');
    check(
        'Shop columns',
        in_array('image_url', $cols, true) && in_array('category', $cols, true),
        'category: ' . (in_array('category', $cols, true) ? 'yes' : 'no')
            . ' · image_url: ' . (in_array('image_url', $cols, true) ? 'yes' : 'no'),
        'Run PART B of backend/schema.sql in phpMyAdmin to add the missing columns.',
    );
} catch (Throwable $e) {
    check('Database', false, $e->getMessage(), 'Check DB_USER / DB_PASS / DB_NAME in config.php.');
}

/* -- Orders ----------------------------------------------------------------- */
/*
 * Checked on its own rather than inside the block above: the catalogue can be
 * perfectly healthy while checkout is dead, and "the orders table is missing"
 * is the one failure the app cannot explain to a shopper.
 */
try {
    $orders  = (int)db()->query('SELECT COUNT(*) FROM orders')->fetchColumn();
    $waiting = (int)db()->query("SELECT COUNT(*) FROM orders WHERE status = 'new'")->fetchColumn();
    db()->query('SELECT COUNT(*) FROM order_items')->fetchColumn();

    check(
        'Orders',
        true,
        $orders . ' placed · ' . $waiting . ' waiting to be packed',
    );
} catch (Throwable $e) {
    check(
        'Orders',
        false,
        'The orders tables are missing, so checkout cannot work',
        'Run PART D of backend/schema.sql in phpMyAdmin, then reload this page.',
    );
}

/* -- The admin website ------------------------------------------------------ */

$adminIndex = __DIR__ . '/admin/index.html';
$adminFiles = ['index.html', 'admin.css', 'admin.js', 'config.js'];
$adminMissing = [];
foreach ($adminFiles as $file) {
    if (!is_file(__DIR__ . '/admin/' . $file)) $adminMissing[] = $file;
}

check(
    'Admin site',
    count($adminMissing) === 0,
    count($adminMissing) === 0
        ? 'admin/ is in place'
        : (is_file($adminIndex) ? 'admin/ is incomplete: ' : 'admin/ is not uploaded: ')
            . 'missing ' . implode(', ', $adminMissing),
    'Upload the four files from backend/admin into a folder called "admin" next '
        . 'to this file, then open /admin/ to sign in.',
);

/* -- Product photos --------------------------------------------------------- */

$dir = defined('UPLOAD_DIR') ? UPLOAD_DIR : __DIR__ . '/uploads';
check(
    'Photo uploads',
    is_dir($dir) && is_writable($dir),
    is_dir($dir) ? (is_writable($dir) ? 'uploads/ is writable' : 'uploads/ is read-only')
                 : 'uploads/ does not exist',
    'Create an "uploads" folder next to this file and chmod it to 755 in File Manager.',
);

/* -- Admin sign-in ---------------------------------------------------------- */

check(
    'Admin password',
    ADMIN_PASSWORD_HASH !== '' ? true : null,
    ADMIN_PASSWORD_HASH !== '' ? 'Stored as a hash' : 'Plain text in config.php',
    'Works either way. To harden it, run makehash.php once, paste the hash into '
        . 'ADMIN_PASSWORD_HASH, blank out ADMIN_PASSWORD, then delete makehash.php.',
);

/*
 * The app sends its login token twice: the standard Authorization header and a
 * copy in X-Auth-Token. Shared hosts running PHP as CGI drop Authorization,
 * which is why the copy exists -- so a "no" on the first line is expected here
 * and not a fault.
 */
$auth = auth_diagnostics();
check(
    'Token headers',
    $auth['authorization_header_reaches_php'] || $auth['x_auth_token_header_seen'] ? true : null,
    'Authorization reaches PHP: ' . ($auth['authorization_header_reaches_php'] ? 'yes' : 'no')
        . ' · X-Auth-Token seen: ' . ($auth['x_auth_token_header_seen'] ? 'yes' : 'no')
        . ' · token accepted: ' . ($auth['token_accepted'] ? 'yes' : 'no'),
    'A browser sends no token, so "no" everywhere is normal here. This turns green '
        . 'when the app itself calls the API.',
);

/* -- Does the domain actually point at this server? -------------------------- */

$serverIp = (string)($_SERVER['SERVER_ADDR'] ?? '');
$host     = (string)(parse_url((string)UPLOAD_URL, PHP_URL_HOST) ?: '');
if ($host === '') {
    $host = preg_replace('/:\d+$/', '', (string)($_SERVER['HTTP_HOST'] ?? ''));
}

if ($host !== '' && !filter_var($host, FILTER_VALIDATE_IP) && function_exists('gethostbyname')) {
    $resolved = gethostbyname($host);
    $looked   = $resolved !== $host;   // gethostbyname returns the input on failure

    if (!$looked || $serverIp === '') {
        check('Domain', null, $host . ' could not be checked from here');
    } else {
        check(
            'Domain',
            $resolved === $serverIp,
            $host . ' points to ' . $resolved . ' · this server is ' . $serverIp,
            'Edit the A record for ' . $host . ' at your DNS provider so it points to '
                . $serverIp . ', then wait for the TTL to lapse.',
        );
    }
}

/* ---------------------------------------------------------------- output -- */

$allOk = true;
foreach ($checks as $c) {
    if ($c['ok'] === false) $allOk = false;
}

$wantsJson = isset($_GET['format']) && $_GET['format'] === 'json';

if ($wantsJson) {
    header('Content-Type: application/json; charset=utf-8');
    $out = ['ok' => $allOk, 'api_build' => API_BUILD, 'checks' => []];
    foreach ($checks as $c) {
        $out['checks'][$c['name']] = ['ok' => $c['ok'], 'detail' => $c['detail']];
    }
    echo json_encode($out, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    exit;
}

header('Content-Type: text/html; charset=utf-8');
$e = fn($s) => htmlspecialchars((string)$s, ENT_QUOTES, 'UTF-8');
?>
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>MediShop API status</title>
<style>
  :root {
    --bg: #f2f2f7; --card: #fff; --line: rgba(60,60,67,.18);
    --text: #000; --muted: rgba(60,60,67,.6);
    --ok: #248a3d; --bad: #d70015; --warn: #c77700;
  }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #000; --card: #1c1c1e; --line: rgba(84,84,88,.65);
            --text: #fff; --muted: rgba(235,235,245,.6); --ok: #30d158; --bad: #ff453a; --warn: #ff9f0a; }
  }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 32px 16px; background: var(--bg); color: var(--text);
         font: 16px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
  main { max-width: 640px; margin: 0 auto; }
  h1 { font-size: 28px; letter-spacing: -.3px; margin: 0 0 4px; }
  .sub { color: var(--muted); font-size: 15px; margin: 0 0 24px; }
  .banner { border-radius: 14px; padding: 14px 16px; margin-bottom: 20px; font-weight: 600;
            background: rgba(52,199,89,.14); color: var(--ok); }
  .banner.bad { background: rgba(255,69,58,.14); color: var(--bad); }
  ul { list-style: none; margin: 0; padding: 0; background: var(--card); border-radius: 14px; overflow: hidden; }
  li { display: flex; gap: 12px; padding: 14px 16px; border-top: 1px solid var(--line); }
  li:first-child { border-top: 0; }
  .mark { flex: none; width: 22px; font-weight: 700; }
  .mark.ok { color: var(--ok); } .mark.bad { color: var(--bad); } .mark.warn { color: var(--warn); }
  .name { font-weight: 600; }
  .detail { color: var(--muted); font-size: 14px; word-break: break-word; }
  .hint { margin-top: 6px; font-size: 14px; color: var(--warn); }
  footer { color: var(--muted); font-size: 13px; margin-top: 20px; text-align: center; }
  a { color: inherit; }
</style>
</head>
<body>
<main>
  <h1>MediShop API</h1>
  <p class="sub">Build <?= $e(API_BUILD) ?> · <?= $e(date('d M Y, H:i')) ?></p>

  <div class="banner <?= $allOk ? '' : 'bad' ?>">
    <?= $allOk ? 'Everything the app needs is working.' : 'Something needs attention — see below.' ?>
  </div>

  <ul>
    <?php foreach ($checks as $c): ?>
      <?php
        $mark  = $c['ok'] === true ? '✓' : ($c['ok'] === false ? '✕' : 'i');
        $class = $c['ok'] === true ? 'ok' : ($c['ok'] === false ? 'bad' : 'warn');
      ?>
      <li>
        <span class="mark <?= $class ?>"><?= $mark ?></span>
        <span>
          <span class="name"><?= $e($c['name']) ?></span><br>
          <span class="detail"><?= $e($c['detail']) ?></span>
          <?php if ($c['ok'] !== true && $c['hint'] !== ''): ?>
            <div class="hint"><?= $e($c['hint']) ?></div>
          <?php endif; ?>
        </span>
      </li>
    <?php endforeach; ?>
  </ul>

  <footer>
    <a href="/admin/">Open the admin site</a> ·
    Machine-readable version: <a href="?format=json">ping.php?format=json</a>
  </footer>
</main>
</body>
</html>
