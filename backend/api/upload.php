<?php
/**
 * Product photo upload. Admin only.
 *
 *   POST upload.php
 *   Headers: X-Api-Key, Authorization: Bearer <admin token>
 *   Body:    {"data":"<base64 of the image bytes>"}
 *   Returns: {"path":"uploads/med_abc123.jpg","url":"http://.../api/uploads/med_abc123.jpg"}
 *
 * The app saves `path` on the product; `url` is there for anything that needs
 * an absolute link (a web page, an email).
 *
 * The phone sends base64 instead of a multipart form because that travels
 * through every proxy unchanged and needs no extra library in the app.
 */
// BUILD: 2026-09-21-shop -- ping.php looks for this line to spot a stale upload.
require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/auth.php';

boot(['POST']);
require_admin();

$in  = body();
$b64 = (string)($in['data'] ?? '');
if ($b64 === '') fail(422, 'No image data received', ['image' => 'Required']);

// Accept a data: URL as well as bare base64.
if (preg_match('~^data:[^;]+;base64,~i', $b64)) {
    $b64 = substr($b64, strpos($b64, ',') + 1);
}

$b64   = preg_replace('/\s+/', '', $b64);   // strip line breaks the phone added
$bytes = base64_decode($b64, true);
if ($bytes === false || $bytes === '') fail(422, 'That image could not be decoded');

if (strlen($bytes) > UPLOAD_MAX_BYTES) {
    fail(413, 'Image is larger than ' . round(UPLOAD_MAX_BYTES / 1048576, 1) . ' MB');
}

// Trust the bytes, not the name: only real images get through.
$info = @getimagesizefromstring($bytes);
$ext  = [
    IMAGETYPE_JPEG => 'jpg',
    IMAGETYPE_PNG  => 'png',
    IMAGETYPE_GIF  => 'gif',
    IMAGETYPE_WEBP => 'webp',
][$info[2] ?? 0] ?? null;

if ($ext === null) fail(422, 'Only JPG, PNG, GIF or WebP images are allowed');

if (!is_dir(UPLOAD_DIR) && !@mkdir(UPLOAD_DIR, 0755, true)) {
    fail(500, 'Upload folder is missing and could not be created');
}
if (!is_writable(UPLOAD_DIR)) {
    fail(500, 'Upload folder is not writable (chmod it to 755 in File Manager)');
}

$file = 'med_' . bin2hex(random_bytes(8)) . '.' . $ext;
if (file_put_contents(UPLOAD_DIR . '/' . $file, $bytes) === false) {
    fail(500, 'Could not save the image');
}

ok([
    // The app stores `path`: relative to the API, so the photo still loads
    // whether the phone reaches the API by domain, by IP or through devproxy.
    'path'   => 'uploads/' . $file,
    'url'    => rtrim(UPLOAD_URL, '/') . '/' . $file,
    'file'   => $file,
    'width'  => $info[0] ?? null,
    'height' => $info[1] ?? null,
], 201);
