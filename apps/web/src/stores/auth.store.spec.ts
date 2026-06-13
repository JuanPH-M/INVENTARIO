import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAuthStore } from './auth.store';
import * as apiModule from '@/lib/api-client';

// Mock the api client module
vi.mock('@/lib/api-client', () => ({
  apiClient: {
    post: vi.fn(),
    get: vi.fn(),
  },
  setMemoryAccessToken: vi.fn(),
  getMemoryAccessToken: vi.fn(() => null),
}));

// Helper to get the mocked functions
function getMocks() {
  const client = apiModule.apiClient as unknown as { post: ReturnType<typeof vi.fn>; get: ReturnType<typeof vi.fn> };
  return client;
}

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
    useAuthStore.setState({ user: null, isAuthenticated: false, isLoading: false });
    localStorage.clear();
  });

  describe('login', () => {
    it('stores access token in memory and sets authenticated on successful login', async () => {
      getMocks().post.mockResolvedValue({
        data: {
          accessToken: 'access-token-123',
          expiresIn: 900,
          tokenType: 'Bearer',
        },
      });
      getMocks().get.mockResolvedValue({ data: { data: mockUser } });

      const { result } = renderHook(() => useAuthStore());

      await act(async () => {
        const res = await result.current.login('admin@test.com', 'password');
        expect(res.requiresMfa).toBe(false);
      });

      expect(result.current.isAuthenticated).toBe(true);
      expect(result.current.user).toMatchObject({ email: 'admin@test.com' });
    });

    it('returns requiresMfa=true when MFA is needed', async () => {
      getMocks().post.mockResolvedValue({
        data: {
          requiresMfa: true,
          mfaToken: 'mfa-temp-token',
        },
      });

      const { result } = renderHook(() => useAuthStore());

      let response: { requiresMfa: boolean; mfaToken?: string } = { requiresMfa: false };
      await act(async () => {
        response = await result.current.login('admin@test.com', 'password');
      });

      expect(response.requiresMfa).toBe(true);
      expect(response.mfaToken).toBe('mfa-temp-token');
      expect(result.current.isAuthenticated).toBe(false);
    });

    it('sets isLoading to false even if login throws', async () => {
      getMocks().post.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useAuthStore());

      await act(async () => {
        await result.current.login('admin@test.com', 'bad-pass').catch(() => {});
      });

      expect(result.current.isLoading).toBe(false);
      expect(result.current.isAuthenticated).toBe(false);
    });
  });

  describe('logout', () => {
    it('clears user state on logout', async () => {
      useAuthStore.setState({ user: mockUser, isAuthenticated: true });

      getMocks().post.mockResolvedValue({ data: {} });

      const { result } = renderHook(() => useAuthStore());

      await act(async () => {
        await result.current.logout();
      });

      expect(result.current.user).toBeNull();
      expect(result.current.isAuthenticated).toBe(false);
    });

    it('clears local state even if API call fails', async () => {
      useAuthStore.setState({ user: mockUser, isAuthenticated: true });
      const mockFn = vi.fn().mockRejectedValue(new Error('Server error'));
      (apiModule.apiClient as unknown as { post: ReturnType<typeof vi.fn> }).post = mockFn;

      const { result } = renderHook(() => useAuthStore());

      // The store's logout uses try/finally so it always clears state
      await act(async () => {
        try {
          await result.current.logout();
        } catch {
          // expected — store swallows it but re-throws if needed
        }
      });

      expect(result.current.user).toBeNull();
      expect(result.current.isAuthenticated).toBe(false);
    });
  });

  describe('hasPermission', () => {
    it('returns true when user has the permission', () => {
      useAuthStore.setState({
        user: { ...mockUser, permissions: ['sales:create', 'inventory:read'] },
        isAuthenticated: true,
      });

      const { result } = renderHook(() => useAuthStore());
      expect(result.current.hasPermission('sales:create')).toBe(true);
    });

    it('returns false when user does not have the permission', () => {
      useAuthStore.setState({
        user: { ...mockUser, permissions: ['sales:read'] },
        isAuthenticated: true,
      });

      const { result } = renderHook(() => useAuthStore());
      expect(result.current.hasPermission('admin:delete')).toBe(false);
    });

    it('returns false when user is null', () => {
      useAuthStore.setState({ user: null, isAuthenticated: false });

      const { result } = renderHook(() => useAuthStore());
      expect(result.current.hasPermission('any:permission')).toBe(false);
    });
  });

  describe('fetchProfile', () => {
    it('sets user on successful fetch', async () => {
      getMocks().get.mockResolvedValue({ data: { data: mockUser } });

      const { result } = renderHook(() => useAuthStore());

      await act(async () => {
        await result.current.fetchProfile();
      });

      expect(result.current.user).toMatchObject(mockUser);
      expect(result.current.isAuthenticated).toBe(true);
    });

    it('clears user on fetch failure', async () => {
      useAuthStore.setState({ user: mockUser, isAuthenticated: true });
      getMocks().get.mockRejectedValue(new Error('Unauthorized'));

      const { result } = renderHook(() => useAuthStore());

      await act(async () => {
        await result.current.fetchProfile();
      });

      expect(result.current.user).toBeNull();
      expect(result.current.isAuthenticated).toBe(false);
    });
  });
});
