import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';

/**
 * Por defecto la web llama a la API en la misma URL (/api) y Next.js la redirige
 * internamente al backend (ver next.config.ts). Así la cookie de sesión es de primer
 * origen y no hace falta CORS. NEXT_PUBLIC_API_URL permite apuntar a otro dominio.
 */
const API_BASE = (process.env['NEXT_PUBLIC_API_URL'] ?? '').replace(/\/$/, '');

// El access token vive solo en memoria (nunca en localStorage → protección frente a XSS)
let memoryAccessToken: string | null = null;

export function setMemoryAccessToken(token: string | null) {
  memoryAccessToken = token;
}

export function getMemoryAccessToken(): string | null {
  return memoryAccessToken;
}

export const apiClient = axios.create({
  baseURL: `${API_BASE}/api`,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true, // envía la cookie HttpOnly del refresh token
  timeout: 30_000,
});

/** Rutas que nunca deben disparar un refresh automático al recibir 401. */
const AUTH_ENDPOINTS = ['/auth/login', '/auth/refresh', '/auth/mfa/verify', '/auth/forgot-password', '/auth/reset-password'];

let refreshPromise: Promise<string | null> | null = null;
let sessionExpiredHandler: (() => void) | null = null;

/** Registra qué hacer cuando la sesión ya no puede renovarse (lo usa el store de auth). */
export function onSessionExpired(handler: () => void) {
  sessionExpiredHandler = handler;
}

/**
 * Renueva el access token usando la cookie de sesión.
 * Las llamadas concurrentes comparten la misma petición (evita rotaciones duplicadas).
 */
export function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = axios
      .post(`${API_BASE}/api/auth/refresh`, {}, { withCredentials: true, timeout: 15_000 })
      .then(({ data }) => {
        const token = (data?.data?.accessToken as string | undefined) ?? null;
        memoryAccessToken = token;
        return token;
      })
      .catch(() => {
        memoryAccessToken = null;
        return null;
      })
      .finally(() => {
        // Pequeña ventana para que peticiones simultáneas reutilicen el resultado
        setTimeout(() => {
          refreshPromise = null;
        }, 100);
      });
  }
  return refreshPromise;
}

apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (memoryAccessToken) {
    config.headers.Authorization = `Bearer ${memoryAccessToken}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as (InternalAxiosRequestConfig & { _retry?: boolean }) | undefined;
    const url = original?.url ?? '';

    if (
      !original ||
      error.response?.status !== 401 ||
      original._retry ||
      AUTH_ENDPOINTS.some((endpoint) => url.startsWith(endpoint))
    ) {
      return Promise.reject(error);
    }

    original._retry = true;
    const token = await refreshAccessToken();
    if (!token) {
      sessionExpiredHandler?.();
      return Promise.reject(error);
    }
    original.headers.Authorization = `Bearer ${token}`;
    return apiClient(original);
  },
);

/** Extrae un mensaje legible de un error de la API. */
export function getErrorMessage(err: unknown, fallback = 'Ocurrió un error inesperado'): string {
  const data = (err as AxiosError<{ message?: string | string[]; errors?: Record<string, string[]> }>)?.response?.data;
  if (data?.errors) {
    const first = Object.values(data.errors).flat()[0];
    if (first) return first;
  }
  if (Array.isArray(data?.message)) return data.message[0] ?? fallback;
  if (typeof data?.message === 'string' && data.message) return data.message;
  if ((err as AxiosError)?.code === 'ECONNABORTED') return 'El servidor tardó demasiado en responder';
  if ((err as AxiosError)?.message === 'Network Error') return 'No hay conexión con el servidor';
  return fallback;
}

export type ApiResponse<T> = {
  success: boolean;
  data: T;
  message?: string;
};

/** Forma estándar de las respuestas paginadas de la API (ver pagination.util en el backend). */
export type Paginated<T> = {
  data: T[];
  meta: { total: number; page: number; limit: number; totalPages: number };
};

export type PaginatedResponse<T> = {
  success: boolean;
  data: {
    items: T[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
};
