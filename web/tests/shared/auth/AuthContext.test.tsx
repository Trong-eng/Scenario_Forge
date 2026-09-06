import { act, renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider, useAuth } from '@/shared/auth/AuthContext';

const response = (ok: boolean, body: unknown, status = ok ? 200 : 401) => ({
  ok,
  status,
  json: async () => body,
}) as Response;

describe('AuthContext & useAuth', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.history.replaceState({}, '', '/workspace');
    globalThis.fetch = vi.fn().mockResolvedValue(response(false, {}));
  });

  it('recovers an unauthenticated cookie session without reading a browser token', async () => {
    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
    expect(result.current.token).toBeNull();
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/auth/me'),
      { credentials: 'include' },
    );
  });

  it('uses the HttpOnly cookie response for dev login without exposing its JWT', async () => {
    globalThis.fetch = vi.fn(async (input) => {
      const url = String(input);
      if (url.endsWith('/me')) return response(false, {});
      return response(true, {
        access_token: 'server-only-token',
        token_type: 'bearer',
        expires_in: 3600,
        user: {
          id: 'user_123',
          email: 'user@scenarioforge.io',
          name: 'Test User',
          role: 'user',
          created_at: '2026-08-20T00:00:00Z',
        },
      });
    });

    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => { await result.current.devLogin('user@scenarioforge.io'); });

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user?.email).toBe('user@scenarioforge.io');
    expect(result.current.token).toBeNull();
    expect(globalThis.fetch).toHaveBeenLastCalledWith(
      expect.stringContaining('/api/v1/auth/dev-login'),
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('authorizes roles only after the server-backed identity is present', async () => {
    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.hasRole('user')).toBe(false);

    act(() => {
      result.current.setSession('ignored-server-token', {
        id: 'u1', email: 'user@sf.io', name: 'User', role: 'user',
      });
    });
    expect(result.current.hasRole('user')).toBe(true);
    expect(result.current.token).toBeNull();
  });

  it('clears the cookie-backed identity upon logout', async () => {
    const { result } = renderHook(() => useAuth(), {
      wrapper: ({ children }) => <AuthProvider>{children}</AuthProvider>,
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    act(() => {
      result.current.setSession('ignored-server-token', {
        id: 'u3', email: 'test@sf.io', name: 'Test', role: 'user',
      });
    });

    await act(async () => { await result.current.logout(false); });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
    expect(globalThis.fetch).toHaveBeenLastCalledWith(
      expect.stringContaining('/api/v1/auth/logout'),
      { method: 'POST', credentials: 'include' },
    );
  });
});
