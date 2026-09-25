-- Run in phpMyAdmin (cp.freehostia.com) on database: jaymag7_students
--
-- FOUR PARTS. Pick what you need -- do not paste the whole file.
--
--   A) The medicines table does NOT exist yet  -> run PART A.
--   B) The table already exists from before the shop update -> run PART B.
--      (Running PART A on an existing table looks like it worked but adds
--       nothing, because of IF NOT EXISTS, and then the INSERT fails with
--       "#1054 Unknown column 'category'".)
--   C) 15 more products to fill the shelves -> run PART C, after A or B.
--   D) Cart and checkout -> run PART D. Needed before the app can take orders.
--
-- Not sure which? Run this first:
--     SHOW COLUMNS FROM medicines;
-- "Unknown table" means case A. A list without a `category` row means case B.
-- For part D:  SHOW TABLES LIKE 'orders';  -- no rows means it has not run.


-- ===========================================================================
-- PART A -- fresh install
-- ===========================================================================

CREATE TABLE IF NOT EXISTS medicines (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  name         VARCHAR(120)   NOT NULL,
  brand        VARCHAR(120)   DEFAULT NULL,
  dosage       VARCHAR(60)    DEFAULT NULL,   -- e.g. "500mg"
  form         VARCHAR(40)    DEFAULT NULL,   -- tablet / capsule / syrup ...
  category     VARCHAR(60)    DEFAULT NULL,   -- shop aisle: Pain relief, Vitamins ...
  quantity     INT            NOT NULL DEFAULT 0,
  price        DECIMAL(10,2)  NOT NULL DEFAULT 0.00,
  expiry_date  DATE           DEFAULT NULL,
  image_url    VARCHAR(255)   DEFAULT NULL,   -- product photo, filled by upload.php
  notes        TEXT           DEFAULT NULL,
  created_at   TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_name (name),
  INDEX idx_category (category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO medicines (name, brand, dosage, form, category, quantity, price, expiry_date, notes) VALUES
  ('Paracetamol', 'Biogesic',  '500mg', 'tablet',  'Pain relief', 120, 3.50,  '2027-06-30', 'For fever and mild pain'),
  ('Amoxicillin', 'Amoxil',    '500mg', 'capsule', 'Antibiotics',  40, 12.00, '2026-12-31', 'Antibiotic - prescription only'),
  ('Cetirizine',  'Virlix',    '10mg',  'tablet',  'Allergy',      60, 8.75,  '2027-03-15', 'Antihistamine');


-- ===========================================================================
-- PART B -- upgrade a table that already has rows in it
-- ===========================================================================
-- Adds the two shop columns and files the old sample rows into aisles. Your
-- existing rows are kept. If a line errors with "Duplicate column name" or
-- "Duplicate key name", that part was already done -- carry on with the rest.
--
-- ALTER TABLE medicines ADD COLUMN category  VARCHAR(60)  DEFAULT NULL AFTER form;
-- ALTER TABLE medicines ADD COLUMN image_url VARCHAR(255) DEFAULT NULL AFTER expiry_date;
-- ALTER TABLE medicines ADD INDEX idx_category (category);
--
-- UPDATE medicines SET category = 'Pain relief' WHERE name = 'Paracetamol';
-- UPDATE medicines SET category = 'Antibiotics' WHERE name = 'Amoxicillin';
-- UPDATE medicines SET category = 'Allergy'     WHERE name = 'Cetirizine';


-- ===========================================================================
-- PART C -- 15 more products
-- ===========================================================================
-- Run this once, after the table exists. Running it twice inserts the same
-- 15 rows again; to undo a double run see the DELETE at the bottom.
--
-- Photos are left empty on purpose: the app draws a lettered placeholder, and
-- an admin can attach a real photo later from Edit Product > Choose from
-- Library. Prices are per piece, in pesos.
--
-- Two rows are deliberately "interesting" so the shop badges have something to
-- show -- change them to ordinary numbers if you would rather they were plain:
--   * Cefalexin    -- only 8 left and expiring soon -> amber "Low stock"
--   * Co-amoxiclav -- quantity 0                    -> red "Out of stock"

INSERT INTO medicines (name, brand, dosage, form, category, quantity, price, expiry_date, notes) VALUES
  ('Ibuprofen',        'Advil',       '200mg',  'tablet',   'Pain relief',            80,   8.50, '2027-09-30', 'For headache, toothache and body pain'),
  ('Mefenamic Acid',   'Dolfenal',    '500mg',  'tablet',   'Pain relief',            55,  14.25, '2027-04-30', 'Menstrual cramps and dental pain'),
  ('Loratadine',       'Claritin',    '10mg',   'tablet',   'Allergy',                50,  24.00, '2027-10-31', 'Non-drowsy antihistamine, once a day'),
  ('Cefalexin',        'Keflex',      '500mg',  'capsule',  'Antibiotics',             8,  26.50, '2026-11-15', 'Antibiotic - prescription only. Finish the full course.'),
  ('Co-amoxiclav',     'Augmentin',   '625mg',  'tablet',   'Antibiotics',             0,  78.00, '2027-01-31', 'Antibiotic - prescription only'),
  ('Carbocisteine',    'Solmux',      '500mg',  'capsule',  'Cough and cold',         85,  11.00, '2027-07-31', 'Loosens phlegm for a productive cough'),
  ('Phenylephrine + Chlorphenamine + Paracetamol', 'Neozep Forte', NULL, 'tablet', 'Cough and cold', 110, 7.25, '2027-05-31', 'For colds, runny nose and fever'),
  ('Salbutamol',       'Ventolin',    '100mcg', 'inhaler',  'Respiratory',            12, 385.00, '2027-02-28', 'Quick relief for asthma - prescription only'),
  ('Loperamide',       'Diatabs',     '2mg',    'capsule',  'Digestive',              70,   6.75, '2028-01-31', 'Stops loose bowel movement'),
  ('Omeprazole',       'Losec',       '20mg',   'capsule',  'Digestive',              45,  22.00, '2027-11-30', 'Reduces stomach acid. Take before breakfast.'),
  ('Oral Rehydration Salts', 'Hydrite', NULL,   'sachet',   'Digestive',              60,  15.00, '2028-05-31', 'Replaces fluids lost to diarrhea. Dissolve in water.'),
  ('Ascorbic Acid',    'Poten-Cee',   '500mg',  'capsule',  'Vitamins',              200,   5.50, '2028-03-31', 'Vitamin C for daily immunity'),
  ('Multivitamins + Iron', 'Sangobion', NULL,   'capsule',  'Vitamins',               75,  12.50, '2027-12-31', 'Iron supplement for tiredness and anemia'),
  ('Metformin',        'Glucophage',  '500mg',  'tablet',   'Diabetes',               65,   9.50, '2027-09-30', 'Maintenance for type 2 diabetes'),
  ('Losartan',         'Lifezar',     '50mg',   'tablet',   'Heart and blood pressure', 70, 21.00, '2028-04-30', 'Maintenance for high blood pressure');

-- OPTIONAL -- pasted image links from Google or a CDN are often longer than
-- 255 characters, and the API rejects those with "Image link is too long".
-- Run this once if you hit that:
-- ALTER TABLE medicines MODIFY image_url VARCHAR(512) DEFAULT NULL;
-- ...and change the 255 in helpers.php (validate_medicine) to 512 to match.

-- Undo a double run (removes the newest copy of each of the 15 above):
-- DELETE FROM medicines
--  WHERE name IN ('Ibuprofen','Mefenamic Acid','Loratadine','Cefalexin','Co-amoxiclav',
--                 'Carbocisteine','Phenylephrine + Chlorphenamine + Paracetamol','Salbutamol',
--                 'Loperamide','Omeprazole','Oral Rehydration Salts','Ascorbic Acid',
--                 'Multivitamins + Iron','Metformin','Losartan')
--    AND id > (SELECT * FROM (SELECT MAX(id) - 15 FROM medicines) AS keep);


-- ===========================================================================
-- PART D -- cart, checkout and receipts
-- ===========================================================================
-- Safe to run on a live shop: it only adds two tables and touches nothing that
-- already exists. Run it once, then re-upload backend/api so orders.php is on
-- the server.
--
-- Why order_items copies the name and the price instead of just pointing at
-- medicines: a receipt is a record of what was actually sold. If it read the
-- price out of medicines, then raising a price tomorrow would silently rewrite
-- every receipt ever issued, and deleting a product would blank out its lines.
-- The medicine_id is kept alongside for reporting, and is set to NULL if the
-- product is ever removed -- the receipt still reads correctly.

CREATE TABLE IF NOT EXISTS orders (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  reference     VARCHAR(24)    NOT NULL,       -- MS-260921-4F2A9C31, shown on the receipt
  customer_name VARCHAR(120)   NOT NULL,
  phone         VARCHAR(40)    DEFAULT NULL,
  address       TEXT           NOT NULL,
  note          TEXT           DEFAULT NULL,   -- "leave with the guard" etc.
  item_count    INT            NOT NULL DEFAULT 0,
  total         DECIMAL(10,2)  NOT NULL DEFAULT 0.00,
  status        VARCHAR(20)    NOT NULL DEFAULT 'new',  -- new / ready / completed / cancelled
  created_at    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_reference (reference),
  INDEX idx_created (created_at),
  INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS order_items (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  order_id    INT            NOT NULL,
  medicine_id INT            DEFAULT NULL,     -- NULL once the product is deleted
  name        VARCHAR(120)   NOT NULL,         -- copied at the moment of sale
  brand       VARCHAR(120)   DEFAULT NULL,
  dosage      VARCHAR(60)    DEFAULT NULL,
  form        VARCHAR(40)    DEFAULT NULL,
  unit_price  DECIMAL(10,2)  NOT NULL,
  quantity    INT            NOT NULL,
  line_total  DECIMAL(10,2)  NOT NULL,
  INDEX idx_order (order_id),
  CONSTRAINT fk_items_order    FOREIGN KEY (order_id)    REFERENCES orders(id)    ON DELETE CASCADE,
  CONSTRAINT fk_items_medicine FOREIGN KEY (medicine_id) REFERENCES medicines(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- The foreign keys need medicines to be InnoDB too. It is, if PART A created
-- it. If PART D errors with "#1215 Cannot add foreign key constraint", run:
--     ALTER TABLE medicines ENGINE=InnoDB;
-- and then PART D again.

-- To wipe test orders and start the receipt numbers over:
-- DELETE FROM orders;            -- order_items go with them (ON DELETE CASCADE)
-- ALTER TABLE orders AUTO_INCREMENT = 1;
