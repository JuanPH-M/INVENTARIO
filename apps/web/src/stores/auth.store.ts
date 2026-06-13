import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { apiClient, setMemoryAccessToken, type ApiResponse } from '@/lib/api-client';

export type AuthUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
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
};

type AuthState = {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<{ requiresMfa: boolean; mfaToken?: string }>;
  verifyMfa: (code: string, mfaToken: string) => Promise<void>;
  logout: () => Promise<void>;
  fetchProfile: () => Promise<void>;
  hasPermission: (permission: string) => boolean;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      isAuthenticated: false,
      isLoading: false,

      login: async (email, password) => {
        set({ isLoading: true });
        try {
          const { data } = await apiClient.post<{
            accessToken?: string;
            requiresMfa?: boolean;
            mfaToken?: string;
            expiresIn?: number;
            tokenType?: string;
          }>('/auth/login', { email, password });

          if (data.requiresMfa) {
            set({ isLoading: false });
            return { requiresMfa: true, mfaToken: data.mfaToken };
          }

          // Store access token in memory only — refresh token is in HttpOnly cookie
          setMemoryAccessToken(data.accessToken ?? null);
          set({ isAuthenticated: true, isLoading: false });
          await get().fetchProfile();
          return { requiresMfa: false };
        } catch (err) {
          set({ isLoading: false });
          throw err;
        }
      },

      verifyMfa: async (code, mfaToken) => {
        const { data } = await apiClient.post<{
          accessToken: string;
          expiresIn: number;
          tokenType: string;
        }>('/auth/mfa/verify', { code, mfaToken });
        setMemoryAccessToken(data.accessToken);
        set({ isAuthenticated: true });
        await get().fetchProfile();
      },

      logout: async () => {
        try {
          await apiClient.post('/auth/logout');
        } finally {
          setMemoryAccessToken(null);
          set({ user: null, isAuthenticated: false });
        }
      },

      fetchProfile: async () => {
        try {
          const { data } = await apiClient.get<ApiResponse<AuthUser>>('/auth/me');
          const profile = data.data;
          if (!profile) {
            set({ user: null, isAuthenticated: false });
            return;
          }
          set({
            user: {
              id: profile.id,
              email: profile.email,
              firstName: profile.firstName,
              lastName: profile.lastName,
              role: profile.role ?? 'employee',
              roles: profile.roles ?? [],
              tenantId: profile.tenantId,
              branchId: profile.branchId,
              permissions: profile.permissions ?? [],
              mfaEnabled: profile.mfaEnabled ?? false,
              avatarUrl: profile.avatarUrl,
              status: profile.status,
              language: profile.language,
              timezone: profile.timezone,
            },
            isAuthenticated: true,
          });
        } catch {
          set({ user: null, isAuthenticated: false });
        }
      },

      hasPermission: (permission) => {
        const { user } = get();
        if (!user) return false;
        return user.permissions.includes(permission);
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({ user: state.user, isAuthenticated: state.isAuthenticated }),
    },
  ),
);
