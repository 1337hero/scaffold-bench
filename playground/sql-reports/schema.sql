CREATE TABLE clients (id INTEGER PRIMARY KEY, name TEXT NOT NULL, active INTEGER DEFAULT 1);
CREATE TABLE orders (id INTEGER PRIMARY KEY, client_id INTEGER, created_at TEXT);
CREATE TABLE order_items (id INTEGER PRIMARY KEY, order_id INTEGER, amount REAL);
CREATE TABLE shipments (id INTEGER PRIMARY KEY, order_id INTEGER, shipped_at TEXT);
CREATE TABLE payments (id INTEGER PRIMARY KEY, client_id INTEGER, amount REAL, month TEXT);
CREATE TABLE refunds (id INTEGER PRIMARY KEY, client_id INTEGER, amount REAL, month TEXT);
