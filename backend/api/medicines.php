<?php
/**
 * CRUD endpoint for medicines.
 *
 *   GET    medicines.php              -> list (optional ?q=search&category=&limit=&offset=)
 *   GET    medicines.php?id=5         -> read one
 *   POST   medicines.php              -> create   (JSON body)
 *   PUT    medicines.php?id=5         -> update   (JSON body, partial allowed)
 *   DELETE medicines.php?id=5         -> delete
 *
 * Every request must carry the header  X-Api-Key: <API_KEY from config.php>
 * POST, PUT and DELETE additionally need  Authorization: Bearer <admin token>
 * from login.php.
 */
// BUILD: 2026-09-21-shop -- ping.php looks for this line to spot a stale upload.
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/auth.php';

boot(['GET', 'POST', 'PUT', 'DELETE']);

// Shoppers may read the catalogue with just the API key; changing it needs a login.
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    require_admin();
}

$id     = isset($_GET['id']) ? (int)$_GET['id'] : 0;
$method = $_SERVER['REQUEST_METHOD'];

try {
    switch ($method) {

        case 'GET':
            if ($id > 0) {
                $stmt = db()->prepare('SELECT * FROM medicines WHERE id = ?');
                $stmt->execute([$id]);
                $row = $stmt->fetch();
                if (!$row) fail(404, 'Medicine not found');
                ok($row);
            }

            $q        = trim((string)($_GET['q'] ?? ''));
            $category = trim((string)($_GET['category'] ?? ''));
            $limit    = min(max((int)($_GET['limit']  ?? 100), 1), 200);
            $offset   = max((int)($_GET['offset'] ?? 0), 0);

            $where  = [];
            $params = [];
            if ($q !== '') {
                $where[]      = '(name LIKE :q OR brand LIKE :q OR form LIKE :q OR category LIKE :q)';
                $params[':q'] = '%' . $q . '%';
            }
            if ($category !== '') {
                $where[]      = 'category = :cat';
                $params[':cat'] = $category;
            }

            $sql = 'SELECT * FROM medicines'
                 . ($where ? ' WHERE ' . implode(' AND ', $where) : '')
                 . ' ORDER BY name ASC LIMIT :lim OFFSET :off';

            $stmt = db()->prepare($sql);
            foreach ($params as $key => $value) $stmt->bindValue($key, $value);
            $stmt->bindValue(':lim', $limit,  PDO::PARAM_INT);
            $stmt->bindValue(':off', $offset, PDO::PARAM_INT);
            $stmt->execute();
            ok($stmt->fetchAll());

        case 'POST':
            [$fields, $errors] = validate_medicine(body(), false);
            if ($errors) fail(422, 'Validation failed', $errors);

            $cols = array_keys($fields);
            $sql  = 'INSERT INTO medicines (' . implode(', ', $cols) . ') VALUES (:'
                  . implode(', :', $cols) . ')';
            db()->prepare($sql)->execute($fields);

            $newId = (int)db()->lastInsertId();
            $stmt  = db()->prepare('SELECT * FROM medicines WHERE id = ?');
            $stmt->execute([$newId]);
            ok($stmt->fetch(), 201);

        case 'PUT':
            if ($id <= 0) fail(400, 'Missing ?id=');

            [$fields, $errors] = validate_medicine(body(), true);
            if ($errors) fail(422, 'Validation failed', $errors);
            if (!$fields) fail(400, 'Nothing to update');

            $sets = implode(', ', array_map(fn($c) => "$c = :$c", array_keys($fields)));
            $stmt = db()->prepare("UPDATE medicines SET $sets WHERE id = :id");
            $stmt->execute($fields + ['id' => $id]);

            $stmt = db()->prepare('SELECT * FROM medicines WHERE id = ?');
            $stmt->execute([$id]);
            $row = $stmt->fetch();
            if (!$row) fail(404, 'Medicine not found');
            ok($row);

        case 'DELETE':
            if ($id <= 0) fail(400, 'Missing ?id=');
            $stmt = db()->prepare('DELETE FROM medicines WHERE id = ?');
            $stmt->execute([$id]);
            if ($stmt->rowCount() === 0) fail(404, 'Medicine not found');
            ok(['id' => $id, 'deleted' => true]);
    }
} catch (PDOException $e) {
    // Swap the message for $e->getMessage() only while debugging.
    fail(500, 'Database error');
}
