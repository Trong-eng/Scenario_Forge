import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginPage } from '@/features/auth/LoginPage';

vi.mock('@/shared/auth/AuthContext', () => ({
  useAuth: () => ({
    loginWithGoogle: vi.fn(), login: vi.fn(), register: vi.fn(), forgotPassword: vi.fn(),
    resetPassword: vi.fn(), logout: vi.fn(), isLoading: false, isAuthenticated: false,
  }),
}));

describe('LoginPage brand', () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses the shared vector mark without changing the home-link name', () => {
    render(<LoginPage />);

    const homeLink = screen.getByRole('link', { name: 'Về trang chủ Scenario Forge' });
    expect(homeLink.querySelector('img')?.getAttribute('src')).toBe('/brand/worker-avatar.png');
  });
});
