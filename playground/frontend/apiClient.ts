type ApiResponse<T> = {
  data: T;
};

export const api = {
  async get<T>(path: string): Promise<ApiResponse<T>> {
    throw new Error(`network disabled in benchmark: GET ${path}`);
  },

  async post<T = unknown>(path: string, body?: unknown): Promise<ApiResponse<T>> {
    void body;
    throw new Error(`network disabled in benchmark: POST ${path}`);
  },
};
