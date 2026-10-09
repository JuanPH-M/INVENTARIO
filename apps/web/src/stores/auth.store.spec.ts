import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useAuthStore } from './auth.store';
import * as apiModule from '@/lib/api-client';

let memoryToken: string | null = null;

vi.mock('@/lib/api-client', () => ({
  apiClient: { post: vi.fn(), get: vi.fn() },
  setMemoryAccessToken: vi.fn((t: string | null) => {
    memoryToken = t;
  }),
  getMemoryAccessToken: vi.fn(() => memoryToken),
  refreshAccessToken: vi.fn(),
  onSessionExpired: vi.fn(),
}));

const api = apiModule as unknown as {
  apiClient: { post: ReturnType<typeof vi.fn>; get: ReturnType<typeof vi.fn> };
  refreshAccessToken: ReturnType<typeof vi.fn>;
  setMemoryAccessToken: ReturnType<typeof vi.fn>;
};

const mockUser = {
  id: 'user-1',
  email: 'admin@test.com',
  firstName: 'Admin',
  lastName: 'Test',
  role: 'admin_general',
  roles: ['admin_general'],
  tenantId: 'tenant-1',
  permissions: ['sales:read', 'sales:create'],
  mfaEnabled: false,
};

describe('useAuthStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    memoryToken = null;
    useAuthStore.setState({ user: null, status: 'idle', isAuthenticated: false, isLoading: false, logoutReason: null });
  });

  describe('login', () => {
    it('stores the access token in memory and loads the profile', async () => {
      api.apiClient.post.mockResolvedValueOnce({ data: { data: { accessToken: 'tok-1' } } });
      api.apiClient.get.mockResolvedValueOnce({ data: { data: mockUser } });

      const result = await useAuthStore.getState().login('admin@test.com', 'Secret123');

      expect(result).toEqual({ requiresMfa: false });
      expect(api.setMemoryAccessToken).toHaveBeenCalledWith('tok-1');
      expect(useAuthStore.getState().status).toBe('authenticated');
      expect(useAuthStore.getState().user?.email).toBe('admin@test.com');
    });

    it('sends the company code when provided', async () => {
      api.apiClient.post.mockResolvedValueOnce({ data: { data: { accessToken: 'tok' } } });
      api.apiClient.get.mockResolvedValueOnce({ data: { data: mockUser } });

      await useAuthStore.getState().login('a@b.com', 'x', 'acme');
      expect(api.apiClient.post).toHaveBeenCalledWith('/auth/login', { email: 'a@b.com', password: 'x', tenantSlug: 'acme' });
    });

    it('returns the MFA token without authenticating when MFA is required', async () => {
      api.apiClient.post.mockResolvedValueOnce({ data: { data: { requiresMfa: true, mfaToken: 'mfa-1' } } });

      const result = await useAuthStore.getState().login('a@b.com', 'x');

      expect(result).toEqual({ requiresMfa: true, mfaToken: 'mfa-1' });
      expect(api.apiClient.get).not.toHaveBeenCalled();
      expect(useAuthStore.getState().status).not.toBe('authenticated');
    });

    it('propagates API errors and resets the loading flag', async () => {
      api.apiClient.post.mockRejectedValueOnce(new Error('401'));
      await expect(useAuthStore.getState().login('a@b.com', 'bad')).rejects.toThrow('401');
      expect(useAuthStore.getState().isLoading).toBe(false);
    });
  });

  describe('verifyMfa', () => {
    it('stores the token and loads the profile', async () => {
      api.apiClient.post.mockResolvedValueOnce({ data: { data: { accessToken: 'tok-mfa' } } });
      api.apiClient.get.mockResolvedValueOnce({ data: { data: mockUser } });

      await useAuthStore.getState().verifyMfa('123456', 'mfa-1');

      expect(api.apiClient.post).toHaveBeenCalledWith('/auth/mfa/verify', { code: '123456', mfaToken: 'mfa-1' });
      expect(useAuthStore.getState().status).toBe('authenticated');
    });
  });

  describe('bootstrap', () => {
    it('restores the session from the refresh cookie', async () => {
      api.refreshAccessToken.mockResolvedValueOnce('tok-refreshed');
      api.apiClient.get.mockResolvedValueOnce({ data: { data: mockUser } });

      await expect(useAuthStore.getState().bootstrap()).resolves.toBe(true);
      expect(useAuthStore.getState().status).toBe('authenticated');
    });

    it('marks the session as anonymous when there is no valid cookie', async () => {
      api.refreshAccessToken.mockResolvedValueOnce(null);

      await expect(useAuthStore.getState().bootstrap()).resolves.toBe(false);
      expect(useAuthStore.getState().status).toBe('anonymous');
      expect(api.apiClient.get).not.toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('calls the API and clears the session even if the request fails', async () => {
      memoryToken = 'tok';
      useAuthStore.setState({ user: mockUser, status: 'authenticated', isAuthenticated: true });
      api.apiClient.post.mockRejectedValueOnce(new Error('network'));

      await useAuthStore.getState().logout();

      expect(api.apiClient.post).toHaveBeenCalledWith('/auth/logout');
      expect(useAuthStore.getState().user).toBeNull();
      expect(useAuthStore.getState().status).toBe('anonymous');
      expect(api.setMemoryAccessToken).toHaveBeenCalledWith(null);
    });
  });

  describe('permissions', () => {
    it('checks single and any-of permissions', () => {
      useAuthStore.setState({ user: mockUser });
      const s = useAuthStore.getState();
      expect(s.hasPermission('sales:read')).toBe(true);
      expect(s.hasPermission('users:delete')).toBe(false);
      expect(s.hasAnyPermission(['users:delete', 'sales:create'])).toBe(true);
    });

    it('returns false without a user', () => {
      expect(useAuthStore.getState().hasPermission('sales:read')).toBe(false);
    });
  });
});
