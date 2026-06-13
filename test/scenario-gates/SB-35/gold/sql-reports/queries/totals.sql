SELECT o.client_id, SUM(oi.amount) as total
FROM orders o
JOIN (SELECT order_id, SUM(amount) as amount FROM order_items GROUP BY order_id) oi ON oi.order_id = o.id
GROUP BY o.client_id;
