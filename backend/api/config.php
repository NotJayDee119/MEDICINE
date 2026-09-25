<?php
/**
 * Database credentials for Freehostia.
 * Freehostia reuses the same string for DB name and DB user: jaymag7_students
 * Put YOUR MySQL password below (the one you set in cPanel > MySQL Databases).
 * DB_HOST on Freehostia is usually "localhost" -- if not, copy the exact host
 * shown next to the database in cPanel (e.g. mysql.freehostia.com).
 */
define('DB_HOST', 'localhost');
define('DB_NAME', 'jaymag7_students');
define('DB_USER', 'jaymag7_students');
define('DB_PASS', 'Yza_15280404');

/** Shared secret the mobile app sends in the X-Api-Key header. Change it. */
define('API_KEY', 'med_WLLHUGTdOcmcG3oduG7oDIR0RgdHd620');

/* ---------------------------------------------------------------------------
 * Shop admin
 * -------------------------------------------------------------------------
 * The API key alone only lets the app READ the catalogue. Adding, editing,
 * deleting and uploading photos also need an admin login.
 *
 * ADMIN_PASSWORD_HASH is the safe way to store the password: open
 *   http://your-domain/api/makehash.php?key=<API_KEY>&p=<your password>
 * once, copy the hash it prints into ADMIN_PASSWORD_HASH, then blank out
 * ADMIN_PASSWORD and delete makehash.php from the server.
 *
 * Until you do that, the plain ADMIN_PASSWORD below is used. config.php is
 * blocked by .htaccess so it is not readable from the web, but a hash is
 * still better.
 */
define('ADMIN_USERNAME', 'admin');
define('ADMIN_PASSWORD', 'ChangeMe123');
define('ADMIN_PASSWORD_HASH', '');

/** Signs admin login tokens. Any long random string; changing it logs admins out. */
define('AUTH_SECRET', 'sess_9Qv4Xm2ZbT7rKp1LdN8sYw3EjHc6Auf0');

/** How long an admin stays logged in, in seconds (7 days). */
define('AUTH_TTL', 7 * 24 * 60 * 60);

/* ---------------------------------------------------------------------------
 * Product photos
 * -------------------------------------------------------------------------
 * UPLOAD_DIR is a folder next to this file; it must exist and be writable.
 * UPLOAD_URL is the public address of that same folder. The app actually
 * stores the relative path ("uploads/med_x.jpg") in medicines.image_url and
 * resolves it against its own API_BASE, so this only matters if something
 * other than the app needs an absolute link.
 */
define('UPLOAD_DIR', __DIR__ . '/uploads');
define('UPLOAD_URL', 'http://jaydee15.mooo.com/api/uploads');

/** Largest photo the upload endpoint accepts, in bytes (3 MB). */
define('UPLOAD_MAX_BYTES', 3 * 1024 * 1024);
