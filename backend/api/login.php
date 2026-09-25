<?php
/**
 * Admin login.
 *
 *   POST login.php   {"username":"admin","password":"..."}  -> {token, expires_at, username}
 *   GET  login.php   Authorization: Bearer <token>          -> {username} if still valid
 *
 * Both still need the X-Api-Key header like every other endpoint.
 */
// BUILD: 2026-09-21-shop -- ping.php looks for this line to spot a stale upload.
require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/auth.php';

boot(['GET', 'POST']);

if ($_SERVER['REQUEST_METHOD'] === 'GET') {
    $user = token_username(bearer_token());
    if ($user === null) fail(401, 'Session expired');
    ok(['username' => $user]);
}

$in       = body();
$username = trim((string)($in['username'] ?? ''));
$password = (string)($in['password'] ?? '');

if ($username === '' || $password === '') {
    fail(422, 'Enter your username and password', [
        'username' => $username === '' ? 'Required' : null,
        'password' => $password === '' ? 'Required' : null,
    ]);
}

// Slow brute force down a little; a wrong guess always costs ~0.4s.
if (!admin_credentials_ok($username, $password)) {
    usleep(400000);
    fail(401, 'Wrong username or password');
}

$session = make_token($username);
ok($session + ['username' => $username]);
