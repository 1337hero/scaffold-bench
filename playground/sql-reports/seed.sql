INSERT INTO clients (id, name, active) VALUES (1, 'Acme Corp', 1);
INSERT INTO clients (id, name, active) VALUES (2, 'Widgets Inc', 1);

INSERT INTO orders (id, client_id, created_at) VALUES (1, 1, '2024-01-15');
INSERT INTO orders (id, client_id, created_at) VALUES (2, 1, '2024-02-20');
INSERT INTO orders (id, client_id, created_at) VALUES (3, 2, '2024-01-10');

INSERT INTO order_items (id, order_id, amount) VALUES (1, 1, 100.00);
INSERT INTO order_items (id, order_id, amount) VALUES (2, 1, 50.00);
INSERT INTO order_items (id, order_id, amount) VALUES (3, 2, 200.00);
INSERT INTO order_items (id, order_id, amount) VALUES (4, 3, 75.00);

-- Order 1 has 2 shipments - this causes the fanout bug (items counted twice)
INSERT INTO shipments (id, order_id, shipped_at) VALUES (1, 1, '2024-01-16');
INSERT INTO shipments (id, order_id, shipped_at) VALUES (2, 1, '2024-01-17');
INSERT INTO shipments (id, order_id, shipped_at) VALUES (3, 2, '2024-02-21');
INSERT INTO shipments (id, order_id, shipped_at) VALUES (4, 3, '2024-01-11');

INSERT INTO payments (id, client_id, amount, month) VALUES (1, 1, 500.00, '2024-01');
INSERT INTO payments (id, client_id, amount, month) VALUES (2, 2, 200.00, '2024-01');

INSERT INTO refunds (id, client_id, amount, month) VALUES (1, 1, 50.00, '2024-01');
