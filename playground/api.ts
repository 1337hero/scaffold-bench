interface ApiConfig {
  baseUrl: string;
  timeout: number;
  retries: number;
}

interface ApiResponse<T> {
  data: T;
  status: number;
  error?: string;
}

const defaultConfig: ApiConfig = {
  baseUrl: "https://api.example.com",
  timeout: 5000,
  retries: 3,
};

async function request<T>(
  path: string,
  options: RequestInit = {},
  config: ApiConfig = defaultConfig
): Promise<ApiResponse<T>> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < config.retries; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), config.timeout);

      const res = await fetch(`${config.baseUrl}${path}`, {
        ...options,
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!res.ok) {
        return { data: null as T, status: res.status, error: res.statusText };
      }

      const data = await res.json();
      return { data, status: res.status };
    } catch (e) {
      lastError = e as Error;
      // BUG: retries immediately with no backoff
      // BUG: retries on ALL errors including 400/401/403 (non-retryable)
      continue;
    }
  }

  return { data: null as T, status: 0, error: lastError?.message ?? "unknown" };
}

async function getUsers() {
  return request<{ id: string; name: string }[]>("/users");
}

async function getUser(id: string) {
  return request<{ id: string; name: string; email: string }>(`/users/${id}`);
}

async function createUser(name: string, email: string) {
  return request<{ id: string }>("/users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, email }),
  });
}

async function deleteUser(id: string) {
  return request<void>(`/users/${id}`, { method: "DELETE" });
}

export { createUser, deleteUser, getUser, getUsers, request };
export type { ApiConfig, ApiResponse };
