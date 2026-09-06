'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/shared/auth/AuthContext';
import { SessionSplash } from '@/shared/auth/SessionSplash';

/** Lands the browser after the identity provider returns.
 *
 *  The session already arrived as an HttpOnly cookie on the redirect, so there is
 *  nothing to read out of the URL. Identity is asked of the server rather than
 *  reconstructed from query parameters: a page that invents a user id from the
 *  address bar is asserting an identity it never verified.
 */
export function AuthCallbackPage() {
  const { refreshSession } = useAuth();
  const [message, setMessage] = useState('Đang thiết lập phiên làm việc an toàn…');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const error = params.get('error');
    if (error) {
      window.location.href = `/login?error=${encodeURIComponent(error)}`;
      return;
    }

    let cancelled = false;
    void refreshSession().then((user) => {
      if (cancelled) return;
      if (!user) {
        window.location.href = `/login?error=${encodeURIComponent('Phiên đăng nhập không hợp lệ')}`;
        return;
      }
      setMessage('Đang chuyển vào Scenario Forge…');
      const target = sessionStorage.getItem('sf_auth_redirect') || '/workspace';
      sessionStorage.removeItem('sf_auth_redirect');
      window.location.href = target;
    });
    return () => { cancelled = true; };
  }, [refreshSession]);

  return <SessionSplash message={message} />;
}
