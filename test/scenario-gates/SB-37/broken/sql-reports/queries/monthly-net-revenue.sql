-- Bug: only groups payments, misses refund-only months
SELECT p.client_id, p.month, SUM(p.amount) - COALESCE(r.total_refund, 0) AS net_revenue
FROM payments p
LEFT JOIN (SELECT client_id, month, SUM(amount) AS total_refund FROM refunds GROUP BY client_id, month) r
  ON r.client_id = p.client_id AND r.month = p.month
GROUP BY p.client_id, p.month
ORDER BY p.client_id, p.month;
