// Stub endpoints used by tests.
//
// fetch() is mocked in every test that references these — nothing here is
// ever actually contacted. Ports are picked outside the dev-server range
// (4317 web, 5173 vite, 8082 local model) so any stray real request fails
// loudly instead of hitting a running service.

export const STUB_LOCAL_ENDPOINT = "http://127.0.0.1:18082/v1/chat/completions";
export const STUB_ONESHOT_ENDPOINT = "http://127.0.0.1:19000";
export const STUB_ONESHOT_DB_ENDPOINT = "http://127.0.0.1:19001";
