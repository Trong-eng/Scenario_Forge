'use client';

import React, { useEffect } from 'react';
import { useAuth } from './AuthContext';
import { ShieldAlert } from 'lucide-react';
import { SessionSplash } from './SessionSplash';
import type { UserRole } from './types';
import { useT } from '@/shared/i18n';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRoles?: UserRole[];
}

export function ProtectedRoute({ children, requiredRoles }: ProtectedRouteProps) {
  const { user, isAuthenticated, isLoading, hasRole } = useAuth();
  const t = useT();

  useEffect(() => {
    if (!isLoading && user?.role === 'admin' && typeof window !== 'undefined' && window.location.pathname === '/workspace') {
      window.location.href = '/admin';
      return;
    }
    if (!isLoading && !isAuthenticated && typeof window !== 'undefined') {
      if (window.location.pathname.startsWith('/workspace') && process.env.NODE_ENV !== 'test') {
        const currentPath = window.location.pathname + window.location.search;
        window.location.href = `/login?redirect=${encodeURIComponent(currentPath)}`;
      }
    }
  }, [isLoading, isAuthenticated, user?.role]);

  // One session screen, in the product's palette. The dark terminal panel this
  // replaced belonged to no other surface in the app.
  if (isLoading) return <SessionSplash message={t('auth.verifying')} />;

  if (!isAuthenticated && process.env.NODE_ENV !== 'test') {
    return null;
  }

  // `user` is required here: the 403 copy names the signed-in account. Without it
  // there is nothing to deny — the unauthenticated case is handled above (and is
  // reachable in tests, where that early return is bypassed).
  // `user` is required here: the copy names the signed-in account, and the
  // unauthenticated case is already handled above.
  if (user && requiredRoles && requiredRoles.length > 0 && !hasRole(...requiredRoles)) {
    return (
      <main className="grid min-h-dvh place-items-center bg-background px-6 text-center">
        <div className="max-w-md space-y-3">
          <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-destructive/10 text-destructive">
            <ShieldAlert aria-hidden="true" className="size-6" />
          </div>
          <h1 className="text-[length:calc(17px*var(--font-scale))] font-semibold tracking-tight">{t('auth.noAccess')}</h1>
          <p className="text-[length:calc(13.5px*var(--font-scale))] leading-relaxed text-muted-foreground">
            {t('auth.noAccessBody', { email: user.email, role: user.role, required: requiredRoles.join(', ') })}
          </p>
          <a href="/login" className="inline-flex min-h-11 items-center rounded-lg border border-border px-4 text-[length:calc(12.5px*var(--font-scale))] font-semibold transition-colors hover:bg-surface">
            {t('auth.switchAccount')}
          </a>
        </div>
      </main>
    );
  }

  return <>{children}</>;
}
