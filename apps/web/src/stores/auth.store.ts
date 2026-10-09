import { create } from 'zustand';
import {
  apiClient,
  onSessionExpired,
  refreshAccessToken,
  setMemoryAccessToken,
  getMemoryAccessToken,
  type ApiResponse,
} from '@/lib/api-client';
import { queryClient } from '@/lib/query-client';

export type AuthUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  role: string;
  roles: string[];
  tenantId: string;
  branchId?: string | null;
  permissions: string[];
  mfaEnabled: boolean;
  avatarUrl?: string | null;
  status?: string;
  language?: string;
  timezone?: string;
  lastLoginAt?: string | null;
  tenant?: { id: string; name: string; slug: string; logoUrl?: string | null } | null;
  userRoles?: Array<{ roleId: string; roleName: string; roleSlug: string; branchId: string | null; branchName: string | null }>;
};

/** idle → aún no se ha comprobado · loading → comprobando · authenticated / anonymous → resultado */
export type SessionStatus = 'idle' | 'loading' | 'authenticated' | 'anonymous';

type LoginResult = { requiresMfa: boolean; mfaToken?: string };

type AuthState = {
  user: AuthUser | null;
  status: SessionStatus;
  /** Motivo del último cierre de sesión forzado (p. ej. sesión expirada) para mostrarlo en el login. */
  logoutReason: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  bootstrap: () => Promise<boolean>;
  login: (email: string, password: string, tenantSlug?: string) => Promise<LoginResult>;
  verifyMfa: (code: string, mfaToken: string) => Promise<void>;
  logout: () => Promise<void>;
  fetchProfile: () => Promise<boolean>;
  setUser: (user: AuthUser) => void;
  hasPermission: (permission: string) => boolean;
  hasAnyPermission: (permissions: string[]) => boolean;
  clearSession: (reason?: string | null) => void;
};

let bootstrapPromise: Promise<boolean> | null = null;

export const useAuthStore = create<AuthState>()((set, get) => ({
  user: null,
  status: 'idle',
  logoutReason: null,
  isAuthenticated: false,
  isLoading: false,

  /**
   * Restaura la sesión al cargar la app: si no hay access token en memoria,
   * intenta renovarlo con la cookie HttpOnly y luego carga el perfil.
   */
  bootstrap: () => {
    if (get().status === 'authenticated' && get().user) return Promise.resolve(true);
    if (!bootstrapPromise) {
      set({ status: 'loading' });
      bootstrapPromise = (async () => {
        if (!getMemoryAccessToken()) {
          const token = await refreshAccessToken();
          if (!token) {
            set({ status: 'anonymous', isAuthenticated: false, user: null });
            return false;
          }
        }
        return get().fetchProfile();
      })().finally(() => {
        bootstrapPromise = null;
      });
    }
    return bootstrapPromise;
  },

  login: async (email, password, tenantSlug) => {
    set({ isLoading: true, logoutReason: null });
    try {
      const { data: res } = await apiClient.post<
        ApiResponse<{ accessToken?: string; requiresMfa?: boolean; mfaToken?: string }>
      >('/auth/login', { email, password, ...(tenantSlug ? { tenantSlug } : {}) });

      if (res.data.requiresMfa) {
        return { requiresMfa: true, mfaToken: res.data.mfaToken };
      }
      setMemoryAccessToken(res.data.accessToken ?? null);
      const ok = await get().fetchProfile();
      if (!ok) throw new Error('No se pudo cargar el perfil');
      return { requiresMfa: false };
    } finally {
      set({ isLoading: false });
    }
  },

  verifyMfa: async (code, mfaToken) => {
    set({ isLoading: true });
    try {
      const { data: res } = await apiClient.post<ApiResponse<{ accessToken: string }>>('/auth/mfa/verify', {
        code,
        mfaToken,
      });
      setMemoryAccessToken(res.data.accessToken);
      await get().fetchProfile();
    } finally {
      set({ isLoading: false });
    }
  },

  logout: async () => {
    try {
      if (getMemoryAccessToken()) await apiClient.post('/auth/logout');
    } catch {
      /* el cierre local ocurre igualmente */
    } finally {
      get().clearSession(null);
    }
  },

  fetchProfile: async () => {
    try {
      const { data } = await apiClient.get<ApiResponse<AuthUser>>('/auth/me');
      const profile = data.data;
      if (!profile) {
        get().clearSession(null);
        return false;
      }
      set({
        user: { ...profile, permissions: profile.permissions ?? [], roles: profile.roles ?? [] },
        status: 'authenticated',
        isAuthenticated: true,
      });
      return true;
    } catch {
      get().clearSession(null);
      return false;
    }
  },

  setUser: (user) => set({ user }),

  hasPermission: (permission) => get().user?.permissions.includes(permission) ?? false,

  hasAnyPermission: (permissions) => {
    const granted = get().user?.permissions ?? [];
    return permissions.some((p) => granted.includes(p));
  },

  clearSession: (reason = null) => {
    setMemoryAccessToken(null);
    queryClient.clear();
    set({ user: null, status: 'anonymous', isAuthenticated: false, logoutReason: reason });
  },
}));

// Si el refresh falla durante el uso normal, se cierra la sesión y el layout redirige al login
onSessionExpired(() => {
  if (useAuthStore.getState().status === 'authenticated') {
    useAuthStore.getState().clearSession('Tu sesión expiró. Inicia sesión de nuevo.');
  }
});

// Limpia datos persistidos por versiones anteriores (ya no se guarda la sesión en localStorage)
if (typeof window !== 'undefined') {
  try {
    window.localStorage.removeItem('auth-storage');
  } catch {
    /* almacenamiento no disponible */
  }
}
