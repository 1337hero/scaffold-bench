SELECT
  t.client_id,
  t.month,
  COALESCE(SUM(CASE WHEN t.kind = 'payment' THEN t.amount ELSE 0 END), 0)
  - COALESCE(SUM(CASE WHEN t.kind = 'refund' THEN t.amount ELSE 0 END), 0) AS net_revenue
FROM (
  SELECT client_id, month, amount, 'payment' AS kind FROM payments
  UNION ALL
  SELECT client_id, month, amount, 'refund' AS kind FROM refunds
) t
GROUP BY t.client_id, t.month
ORDER BY t.client_id, t.month;
