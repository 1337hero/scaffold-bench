# Webhook Endpoint Specification

## POST /webhooks/orders

Receives incoming order webhook events from third-party services.

### Authentication

All requests must include an `X-Signature` header formatted as `sha256=<hex-hmac>`, an HMAC-SHA256 signature of the request body using the `WEBHOOK_SECRET` env var. Compare using a constant-time comparison.

### Deduplication

Each event has a unique `event_id` field. The endpoint must:

1. Store processed event IDs in the `webhook_events` table
2. Return 200 OK for duplicate events (idempotent)
3. Only process each event once

### Request Body

```json
{
  "event_id": "evt_123abc",
  "type": "payment.completed",
  "data": { ... },
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### Response

- 200 OK: Event received (or already processed)
- 401 Unauthorized: Invalid signature
- 400 Bad Request: Invalid payload

### Error Handling

Log all errors but do not expose internal details in responses.
