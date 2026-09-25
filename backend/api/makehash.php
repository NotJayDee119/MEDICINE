<?php
/**
 * One-off helper: prints a bcrypt hash of a password so you can paste it into
 * ADMIN_PASSWORD_HASH in config.php.
 *
 *   http://your-domain/api/makehash.php?key=<API_KEY>&p=<the password>
 *
 * DELETE THIS FILE from the server once you have your hash.
 */
require_once __DIR__ . '/config.php';

header('Content-Type: text/plain; charset=utf-8');

if (!hash_equals(API_KEY, (string)($_GET['key'] ?? ''))) {
    http_response_code(401);
    exit("Add ?key=<your API_KEY> to the URL.\n");
}

$password = (string)($_GET['p'] ?? '');
if ($password === '') {
    exit("Add &p=<the password you want> to the URL.\n");
}

echo "Paste this into config.php:\n\n";
echo "define('ADMIN_PASSWORD_HASH', '" . password_hash($password, PASSWORD_DEFAULT) . "');\n\n";
echo "Then set ADMIN_PASSWORD back to '' and delete makehash.php.\n";
