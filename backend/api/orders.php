<?php
/**
 * Customer orders.
 *
 *   POST   orders.php                 -> place an order   (shopper, API key only)
 *   GET    orders.php?reference=MS-.. -> one receipt      (shopper: the reference
 *                                        is long and random, so knowing it is
 *                                        what proves the order is yours)
 *   GET    orders.php                 -> every order      (admin token)
 *   GET    orders.php?id=5            -> one order        (admin token)
 *   PUT    orders.php?id=5            -> {"status":"ready"} (admin token)
 *
 * Placing an order takes the stock down inside a transaction, so two shoppers
 * racing for the last box cannot both win: the rows are locked with
 * SELECT ... FOR UPDATE, checked, and then either all of it commits or none of
 * it does. A shortfall comes back as 409 with the per-product detail, and the
 * catalogue is left exactly as it was.
 */
// BUILD: 2026-09-21-shop -- ping.php looks for this line to spot a stale upload.
require_once __DIR__ . '/db.php';
require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/auth.php';

boot(['GET', 'POST', 'PUT']);

/** Statuses the admin may set, in the order an order moves through them. */
const ORDER_STATUSES = ['new', 'ready', 'completed', 'cancelled'];

/** MS-260921-4F2A9C31 — the date for a human, 8 hex so it cannot be guessed. */
function make_reference(): string {
    return 'MS-' . date('ymd') . '-' . strtoupper(bin2hex(random_bytes(4)));
}

/** An order plus its lines, shaped the way the app and the receipt want it. */
function fetch_order(int $id): ?array {
    $stmt = db()->prepare('SELECT * FROM orders WHERE id = ?');
    $stmt->execute([$id]);
    $order = $stmt->fetch();
    if (!$order) return null;

    $lines = db()->prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY id');
    $lines->execute([$id]);
    $order['items'] = $lines->fetchAll();
    return $order;
}

try {
    $method = $_SERVER['REQUEST_METHOD'];

    /* ------------------------------------------------------------ reading -- */

    if ($method === 'GET') {
        $reference = trim((string)($_GET['reference'] ?? ''));

        // A shopper checking their own receipt. The reference is the key.
        if ($reference !== '') {
            $stmt = db()->prepare('SELECT id FROM orders WHERE reference = ?');
            $stmt->execute([$reference]);
            $row = $stmt->fetch();
            if (!$row) fail(404, 'No order with that reference');
            ok(fetch_order((int)$row['id']));
        }

        // Everything else is the admin's view of the shop.
        require_admin();

        $id = (int)($_GET['id'] ?? 0);
        if ($id > 0) {
            $order = fetch_order($id);
            if (!$order) fail(404, 'Order not found');
            ok($order);
        }

        $status = trim((string)($_GET['status'] ?? ''));
        $limit  = min(max((int)($_GET['limit'] ?? 100), 1), 200);
        $offset = max((int)($_GET['offset'] ?? 0), 0);

        $sql    = 'SELECT * FROM orders';
        $params = [];
        if ($status !== '' && in_array($status, ORDER_STATUSES, true)) {
            $sql .= ' WHERE status = :status';
            $params[':status'] = $status;
        }
        $sql .= ' ORDER BY id DESC LIMIT :lim OFFSET :off';

        $stmt = db()->prepare($sql);
        foreach ($params as $key => $value) $stmt->bindValue($key, $value);
        $stmt->bindValue(':lim', $limit, PDO::PARAM_INT);
        $stmt->bindValue(':off', $offset, PDO::PARAM_INT);
        $stmt->execute();
        $orders = $stmt->fetchAll();

        // One extra query for all the lines beats one query per order.
        if ($orders) {
            $ids  = array_column($orders, 'id');
            $marks = implode(',', array_fill(0, count($ids), '?'));
            $lines = db()->prepare("SELECT * FROM order_items WHERE order_id IN ($marks) ORDER BY id");
            $lines->execute($ids);

            $byOrder = [];
            foreach ($lines->fetchAll() as $line) {
                $byOrder[(int)$line['order_id']][] = $line;
            }
            foreach ($orders as $i => $order) {
                $orders[$i]['items'] = $byOrder[(int)$order['id']] ?? [];
            }
        }
        ok($orders);
    }

    /* ---------------------------------------------------- admin: status -- */

    if ($method === 'PUT') {
        require_admin();

        $id = (int)($_GET['id'] ?? 0);
        if ($id <= 0) fail(400, 'Missing ?id=');

        $in     = body();
        $status = trim((string)($in['status'] ?? ''));
        if (!in_array($status, ORDER_STATUSES, true)) {
            fail(422, 'Unknown status', ['status' => 'Use one of: ' . implode(', ', ORDER_STATUSES)]);
        }

        $stmt = db()->prepare('UPDATE orders SET status = ? WHERE id = ?');
        $stmt->execute([$status, $id]);

        $order = fetch_order($id);
        if (!$order) fail(404, 'Order not found');
        ok($order);
    }

    /* ------------------------------------------------- shopper: checkout -- */

    $in = body();

    $name    = trim((string)($in['customer_name'] ?? ''));
    $address = trim((string)($in['address'] ?? ''));
    $phone   = trim((string)($in['phone'] ?? ''));
    $note    = trim((string)($in['note'] ?? ''));
    $items   = $in['items'] ?? [];

    $errors = [];
    if ($name === '')                 $errors['customer_name'] = 'Please enter your name';
    elseif (mb_strlen($name) > 120)   $errors['customer_name'] = 'Name is too long (max 120)';

    if ($address === '')              $errors['address'] = 'Please enter your delivery address';
    elseif (mb_strlen($address) > 500) $errors['address'] = 'Address is too long (max 500)';

    if ($phone !== '' && mb_strlen($phone) > 40) $errors['phone'] = 'Phone number is too long';
    if ($note !== '' && mb_strlen($note) > 500)  $errors['note']  = 'Note is too long (max 500)';

    if (!is_array($items) || count($items) === 0) {
        $errors['items'] = 'Your cart is empty';
    }

    // Fold duplicate lines for the same product into one before touching stock.
    $wanted = [];
    if (!isset($errors['items'])) {
        foreach ($items as $line) {
            $id  = (int)($line['id'] ?? 0);
            $qty = (int)($line['quantity'] ?? 0);
            if ($id <= 0 || $qty <= 0) {
                $errors['items'] = 'One of the items in your cart is not valid';
                break;
            }
            if (!isset($wanted[$id])) $wanted[$id] = 0;
            $wanted[$id] += $qty;
        }
    }
    if (!$errors && count($wanted) > 50) {
        $errors['items'] = 'That is too many different products for one order (max 50)';
    }

    if ($errors) fail(422, 'Please check the form', $errors);

    db()->beginTransaction();
    try {
        $lines = [];
        $total = 0.0;
        $count = 0;
        $short = [];

        foreach ($wanted as $id => $qty) {
            // FOR UPDATE holds the row until this transaction ends, so a second
            // shopper checking out at the same moment waits here rather than
            // reading a stock number that is about to change.
            $stmt = db()->prepare('SELECT * FROM medicines WHERE id = ? FOR UPDATE');
            $stmt->execute([$id]);
            $med = $stmt->fetch();

            if (!$med) {
                $short[] = 'One item is no longer sold';
                continue;
            }
            if ((int)$med['quantity'] < $qty) {
                $short[] = (int)$med['quantity'] === 0
                    ? $med['name'] . ' just went out of stock'
                    : 'Only ' . (int)$med['quantity'] . ' left of ' . $med['name'];
                continue;
            }

            $unit = round((float)$med['price'], 2);
            $line = round($unit * $qty, 2);
            $total += $line;
            $count += $qty;

            $lines[] = [
                'medicine_id' => (int)$med['id'],
                'name'        => $med['name'],
                'brand'       => $med['brand'],
                'dosage'      => $med['dosage'],
                'form'        => $med['form'],
                'unit_price'  => $unit,
                'quantity'    => $qty,
                'line_total'  => $line,
            ];

            $take = db()->prepare('UPDATE medicines SET quantity = quantity - ? WHERE id = ?');
            $take->execute([$qty, $id]);
        }

        if ($short) {
            db()->rollBack();
            // 409: nothing was wrong with the request, the shelf just moved.
            fail(409, 'Some items are no longer available', ['items' => implode('. ', $short)]);
        }

        // reference is UNIQUE; on the astronomically unlikely collision, retry.
        $order = null;
        for ($attempt = 0; $attempt < 5; $attempt++) {
            $reference = make_reference();
            $stmt = db()->prepare(
                'INSERT INTO orders (reference, customer_name, phone, address, note, item_count, total)
                 VALUES (?, ?, ?, ?, ?, ?, ?)'
            );
            try {
                $stmt->execute([
                    $reference,
                    $name,
                    $phone === '' ? null : $phone,
                    $address,
                    $note === '' ? null : $note,
                    $count,
                    round($total, 2),
                ]);
                $order = (int)db()->lastInsertId();
                break;
            } catch (PDOException $e) {
                if ((string)$e->getCode() !== '23000') throw $e;   // not a duplicate key
            }
        }
        if ($order === null) {
            db()->rollBack();
            fail(500, 'Could not allocate an order number');
        }

        $insert = db()->prepare(
            'INSERT INTO order_items
               (order_id, medicine_id, name, brand, dosage, form, unit_price, quantity, line_total)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
        );
        foreach ($lines as $line) {
            $insert->execute([
                $order,
                $line['medicine_id'],
                $line['name'],
                $line['brand'],
                $line['dosage'],
                $line['form'],
                $line['unit_price'],
                $line['quantity'],
                $line['line_total'],
            ]);
        }

        db()->commit();
        ok(fetch_order($order), 201);
    } catch (Throwable $e) {
        if (db()->inTransaction()) db()->rollBack();
        throw $e;
    }
} catch (PDOException $e) {
    // A missing orders table is the one database error worth naming, because it
    // means PART D of schema.sql has not been run and nothing else will work.
    // getCode() on a PDOException is the SQLSTATE string, but the base class
    // types it int, so cast before comparing.
    if ((string)$e->getCode() === '42S02' && strpos($e->getMessage(), 'order') !== false) {
        fail(500, 'The orders table is missing. Run PART D of schema.sql in phpMyAdmin.');
    }
    fail(500, 'Database error');
}
