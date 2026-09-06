'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { clearStoredAuth } from './auth-storage';
import type { AuthState, AuthUser, UserRole } from './types';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? process.env.NEXT_PUBLIC_API_URL ?? '';

interface AuthContextValue extends AuthState {
  loginWithGoogle: (redirectPath?: string) => Promise<void>;
  devLogin: (email?: string, name?: string) => Promise<AuthUser>;
  /** Password credential flows. `devLogin` mints a session without proof and is
   *  development-only; these are the real ones. */
  login: (email: string, password: string) => Promise<AuthUser>;
  register: (email: string, password: string, name: string) => Promise<AuthUser>;
  forgotPassword: (email: string) => Promise<{ detail: string; reset_url: string | null }>;
  resetPassword: (token: string, password: string) => Promise<AuthUser>;
  /** Rotating a password re-proves the current one, so a hijacked session
   *  cannot take the account over permanently. */
  changePassword: (currentPassword: string, newPassword: string) => Promise<AuthUser>;
  setSession: (token: string, user: AuthUser) => void;
  /** Re-ask the server who the session cookie belongs to. */
  refreshSession: () => Promise<AuthUser | null>;
  logout: (redirect?: boolean) => Promise<void>;
  hasRole: (...roles: UserRole[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const isPublicLanding = typeof window !== 'undefined' && window.location.pathname === '/';

  // The session lives in an HttpOnly cookie, so the browser cannot read it and
  // neither can an injected script. Identity is therefore recovered by asking the
  // server who the cookie belongs to, rather than by trusting a copy in storage.
  const refreshSession = useCallback(async (): Promise<AuthUser | null> => {
    const me = await fetch(`${API_BASE}/api/v1/auth/me`, { credentials: 'include' })
      .then(async (res) => (res.ok ? ((await res.json()) as AuthUser) : null))
      .catch(() => null);
    setUser(me);
    return me;
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (isPublicLanding) {
      setIsLoading(false);
      return () => { cancelled = true; };
    }
    void fetch(`${API_BASE}/api/v1/auth/me`, { credentials: 'include' })
      .then(async (res) => (res.ok ? ((await res.json()) as AuthUser) : null))
      .catch(() => null)
      .then((me) => { if (!cancelled) setUser(me); })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [isPublicLanding]);

  // The credential itself is never held in JavaScript; the server already set the
  // cookie on the response that produced this user.
  const setSession = useCallback((_newToken: string, newUser: AuthUser) => {
    setToken(null);
    setUser(newUser);
  }, []);

  const loginWithGoogle = useCallback(async (redirectPath = '/workspace') => {
    setIsLoading(true);
    try {
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('sf_auth_redirect', redirectPath);
      }
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const query = origin ? `?origin=${encodeURIComponent(origin)}` : '';
      const res = await fetch(`${API_BASE}/api/v1/auth/google/url${query}`);
      if (!res.ok) {
        throw new Error('Failed to get Google authorization URL');
      }
      const data = await res.json();
      if (data.url && typeof window !== 'undefined') {
        window.location.href = data.url;
      }
    } catch (err) {
      setIsLoading(false);
      throw err;
    }
  }, []);

  const devLogin = useCallback(
    async (email?: string, name?: string): Promise<AuthUser> => {
      setIsLoading(true);
      try {
        const res = await fetch(`${API_BASE}/api/v1/auth/dev-login`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            role: 'user',
            email: email || 'user@scenarioforge.io',
            name,
          }),
        });

        if (!res.ok) {
          throw new Error(`Dev login failed with status ${res.status}`);
        }

        const data = await res.json();
        const loggedUser: AuthUser = {
          id: data.user.id,
          email: data.user.email,
          name: data.user.name,
          avatar_url: data.user.avatar_url,
          role: 'user',
          created_at: data.user.created_at,
        };

        setSession(data.access_token, loggedUser);
        return loggedUser;
      } finally {
        setIsLoading(false);
      }
    },
    [setSession]
  );

  const logout = useCallback(async (redirect = true) => {
    setIsLoading(true);
    try {
      await fetch(`${API_BASE}/api/v1/auth/logout`, { method: 'POST', credentials: 'include' }).catch(() => {});
    } finally {
      clearStoredAuth();
      setUser(null);
      setToken(null);
      setIsLoading(false);
      if (redirect && typeof window !== 'undefined') {
        window.location.href = '/login';
      }
    }
  }, []);

  const hasRole = useCallback(
    (...roles: UserRole[]) => {
      return Boolean(user && (roles.length === 0 || roles.includes(user.role)));
    },
    [user]
  );

  const credentialCall = useCallback(async (path: string, body: Record<string, string>): Promise<AuthUser> => {
    const res = await fetch(`${API_BASE}/api/v1/auth/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.detail || 'Không thể hoàn tất yêu cầu.');
    setSession(data.access_token, data.user);
    return data.user as AuthUser;
  }, [setSession]);

  const login = useCallback(
    async (email: string, password: string) => {
      const logged = await credentialCall('login', { email, password });
      if (logged.role === 'admin' && typeof window !== 'undefined') window.location.href = '/admin';
      return logged;
    },
    [credentialCall],
  );

  const register = useCallback(
    (email: string, password: string, name: string) => credentialCall('register', { email, password, name }),
    [credentialCall],
  );

  const changePassword = useCallback(
    (currentPassword: string, newPassword: string) =>
      credentialCall('change-password', { current_password: currentPassword, new_password: newPassword }),
    [credentialCall],
  );

  const resetPassword = useCallback(
    (token: string, password: string) => credentialCall('reset-password', { token, password }),
    [credentialCall],
  );

  const forgotPassword = useCallback(async (email: string) => {
    const res = await fetch(`${API_BASE}/api/v1/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.detail || 'Không thể gửi yêu cầu đặt lại mật khẩu.');
    return data as { detail: string; reset_url: string | null };
  }, []);

  const value: AuthContextValue = {
    user,
    token,
    isLoading,
    isAuthenticated: Boolean(user),
    loginWithGoogle,
    devLogin,
    login,
    register,
    forgotPassword,
    resetPassword,
    changePassword,
    setSession,
    refreshSession,
    logout,
    hasRole,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

const defaultGuestContext: AuthContextValue = {
  user: null,
  token: null,
  isLoading: false,
  isAuthenticated: false,
  loginWithGoogle: async () => {},
  devLogin: async (email?: string) => ({
    id: 'guest',
    email: email || 'user@scenarioforge.io',
    name: 'Guest User',
    role: 'user',
  }),
  setSession: () => {},
  refreshSession: async () => null,
  login: async () => { throw new Error('Chưa có phiên xác thực.'); },
  register: async () => { throw new Error('Chưa có phiên xác thực.'); },
  forgotPassword: async () => ({ detail: 'Chưa có phiên xác thực.', reset_url: null }),
  resetPassword: async () => { throw new Error('Chưa có phiên xác thực.'); },
  changePassword: async () => { throw new Error('Chưa có phiên xác thực.'); },
  logout: async () => {},
  hasRole: () => false,
};

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  return context || defaultGuestContext;
}
