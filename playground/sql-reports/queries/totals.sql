-- Bug: joining shipments causes order totals to be multiplied by shipment count
SELECT o.client_id, SUM(oi.amount) as total
FROM orders o
JOIN order_items oi ON oi.order_id = o.id
JOIN shipments s ON s.order_id = o.id
GROUP BY o.client_id;
