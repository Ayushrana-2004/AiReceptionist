const BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';

const TOKEN_KEY = 'auth_token';
const REFRESH_TOKEN_KEY = 'auth_refresh_token';

function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

function setRefreshToken(token: string): void {
  localStorage.setItem(REFRESH_TOKEN_KEY, token);
}

function clearTokens(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

interface ApiResponse<T> {
  data: T;
  status: number;
}

interface ApiError {
  error: string;
  fields?: Array<{
    field: string;
    message: string;
    maxLength?: number;
    actualLength?: number;
  }>;
}

class ApiClientError extends Error {
  status: number;
  body: ApiError;

  constructor(status: number, body: ApiError) {
    super(body.error || `API error: ${status}`);
    this.status = status;
    this.body = body;
  }
}

async function refreshAccessToken(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  try {
    const response = await fetch(`${BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (!response.ok) {
      clearTokens();
      return false;
    }

    const data = await response.json();
    setToken(data.token);
    if (data.refreshToken) {
      setRefreshToken(data.refreshToken);
    }
    return true;
  } catch {
    clearTokens();
    return false;
  }
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<ApiResponse<T>> {
  const url = `${BASE_URL}${path}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  const token = getToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  let response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  // Attempt token refresh on 401
  if (response.status === 401 && token) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      headers['Authorization'] = `Bearer ${getToken()}`;
      response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
    } else {
      clearTokens();
      window.location.href = '/login';
      throw new ApiClientError(401, { error: 'Session expired' });
    }
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new ApiClientError(response.status, errorBody);
  }

  const data = await response.json();
  return { data, status: response.status };
}

const apiClient = {
  get<T>(path: string): Promise<ApiResponse<T>> {
    return request<T>('GET', path);
  },

  post<T>(path: string, body?: unknown): Promise<ApiResponse<T>> {
    return request<T>('POST', path, body);
  },

  put<T>(path: string, body?: unknown): Promise<ApiResponse<T>> {
    return request<T>('PUT', path, body);
  },

  delete<T>(path: string): Promise<ApiResponse<T>> {
    return request<T>('DELETE', path);
  },

  // Auth helpers
  setToken,
  setRefreshToken,
  getToken,
  clearTokens,
};

export { apiClient, ApiClientError };
export type { ApiResponse, ApiError };
