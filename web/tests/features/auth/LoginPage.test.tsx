import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginPage } from '@/features/auth/LoginPage';

const auth = vi.hoisted(() => ({
  loginWithGoogle: vi.fn(), login: vi.fn(), register: vi.fn(),
  forgotPassword: vi.fn(), resetPassword: vi.fn(), logout: vi.fn(),
  isLoading: false, isAuthenticated: false,
}));

vi.mock('@/shared/auth/AuthContext', () => ({ useAuth: () => auth }));

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NEXT_PUBLIC_DEMO_ACCOUNT_EMAIL', 'test@gmail.com');
    vi.stubEnv('NEXT_PUBLIC_DEMO_ACCOUNT_PASSWORD', 'demo-fixture-password');
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    auth.login.mockResolvedValue({});
    auth.register.mockResolvedValue({});
    auth.forgotPassword.mockResolvedValue({
      detail: 'Nếu email tồn tại, hướng dẫn đặt lại mật khẩu đã được gửi.', reset_url: null,
    });
    auth.resetPassword.mockResolvedValue({});
    auth.logout.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('keeps Google sign-in and the approved login composition prominent', () => {
    render(<LoginPage />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain('Vào đường thử nghiệm');
    expect(screen.getByRole('button', { name: 'Tiếp tục với Google' }).hasAttribute('disabled')).toBe(false);
    expect(screen.getByTestId('email-input')).toBeDefined();
  });

  it('submits email and password through the credential login path', async () => {
    const user = userEvent.setup();
    // Hold the external navigation boundary open; this test owns form dispatch,
    // while browser navigation is covered by the end-to-end pass.
    auth.login.mockReturnValue(new Promise(() => {}));
    render(<LoginPage />);
    await user.type(screen.getByTestId('email-input'), 'test@scenarioforge.io');
    await user.type(screen.getByTestId('password-input'), 'MatKhauCuaToi123');
    await user.click(screen.getByRole('button', { name: 'Đăng nhập' }));
    expect(auth.login).toHaveBeenCalledWith('test@scenarioforge.io', 'MatKhauCuaToi123');
  });

  it('fills the configured demo account without submitting login', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);

    const demoFillButton = screen.getByRole('button', { name: 'Điền tài khoản demo' });
    expect(demoFillButton.getAttribute('type')).toBe('button');
    await user.click(demoFillButton);

    expect((screen.getByTestId('email-input') as HTMLInputElement).value).toBe('test@gmail.com');
    expect((screen.getByTestId('password-input') as HTMLInputElement).value).toBe('demo-fixture-password');
    expect(auth.login).not.toHaveBeenCalled();
    expect(auth.register).not.toHaveBeenCalled();
  });

  it('hides the demo quick-fill when credentials are incomplete or the form is not in login mode', async () => {
    vi.stubEnv('NEXT_PUBLIC_DEMO_ACCOUNT_PASSWORD', '');
    const user = userEvent.setup();
    const { rerender } = render(<LoginPage />);
    expect(screen.queryByRole('button', { name: 'Điền tài khoản demo' })).toBeNull();

    vi.stubEnv('NEXT_PUBLIC_DEMO_ACCOUNT_PASSWORD', 'demo-fixture-password');
    rerender(<LoginPage />);
    await user.click(screen.getByRole('button', { name: 'Tạo tài khoản mới' }));
    expect(screen.queryByRole('button', { name: 'Điền tài khoản demo' })).toBeNull();
  });

  it('registers with email and two matching passwords, never a display-name field', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);
    await user.click(screen.getByRole('button', { name: 'Tạo tài khoản mới' }));
    expect(screen.queryByTestId('name-input')).toBeNull();
    expect(screen.getByTestId('password-confirmation-input')).toBeDefined();
    await user.type(screen.getByTestId('email-input'), 'new.user@example.com');
    await user.type(screen.getByTestId('password-input'), 'MatKhau123');
    await user.type(screen.getByTestId('password-confirmation-input'), 'KhongTrung123');
    await user.click(screen.getByRole('button', { name: 'Tạo tài khoản' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Mật khẩu nhập lại chưa khớp');
    expect(auth.register).not.toHaveBeenCalled();
  });

  it('returns to login with retained email and a success status after registration', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);
    await user.click(screen.getByRole('button', { name: 'Tạo tài khoản mới' }));
    await user.type(screen.getByTestId('email-input'), 'new.user@example.com');
    await user.type(screen.getByTestId('password-input'), 'MatKhau123');
    await user.type(screen.getByTestId('password-confirmation-input'), 'MatKhau123');
    await user.click(screen.getByRole('button', { name: 'Tạo tài khoản' }));

    await waitFor(() => expect(auth.register).toHaveBeenCalledWith('new.user@example.com', 'MatKhau123', 'new.user'));
    expect(auth.logout).toHaveBeenCalledWith(false);
    expect(screen.getByRole('button', { name: 'Đăng nhập' })).toBeDefined();
    expect((screen.getByTestId('email-input') as HTMLInputElement).value).toBe('new.user@example.com');
    expect((screen.getByTestId('password-input') as HTMLInputElement).value).toBe('');
    expect(screen.getByRole('status').textContent).toContain('Đăng ký thành công');
  });

  it('uses a development reset URL internally without displaying its token', async () => {
    const user = userEvent.setup();
    auth.forgotPassword.mockResolvedValue({
      detail: 'Nếu email tồn tại, hướng dẫn đặt lại mật khẩu đã được gửi.',
      reset_url: 'http://localhost:3000/reset-password?token=secret-reset-token',
    });
    render(<LoginPage />);
    await user.click(screen.getByRole('button', { name: 'Quên mật khẩu?' }));
    await user.type(screen.getByTestId('email-input'), 'owner@example.com');
    await user.click(screen.getByRole('button', { name: 'Tiếp tục' }));
    expect(await screen.findByTestId('new-password-input')).toBeDefined();
    expect(screen.getByTestId('new-password-confirmation-input')).toBeDefined();
    expect(document.body.textContent).not.toContain('secret-reset-token');
    expect(document.body.textContent).not.toContain('reset-password?token=');
  });

  it('resets the development password and returns to login without a session', async () => {
    const user = userEvent.setup();
    auth.forgotPassword.mockResolvedValue({
      detail: 'Nếu email tồn tại, hướng dẫn đặt lại mật khẩu đã được gửi.',
      reset_url: 'http://localhost:3000/reset-password?token=secret-reset-token',
    });
    render(<LoginPage />);
    await user.click(screen.getByRole('button', { name: 'Quên mật khẩu?' }));
    await user.type(screen.getByTestId('email-input'), 'owner@example.com');
    await user.click(screen.getByRole('button', { name: 'Tiếp tục' }));
    await user.type(await screen.findByTestId('new-password-input'), 'MatKhauMoi123');
    await user.type(screen.getByTestId('new-password-confirmation-input'), 'MatKhauMoi123');
    await user.click(screen.getByRole('button', { name: 'Đặt lại mật khẩu' }));

    await waitFor(() => expect(auth.resetPassword).toHaveBeenCalledWith('secret-reset-token', 'MatKhauMoi123'));
    expect(auth.logout).toHaveBeenCalledWith(false);
    expect(screen.getByRole('button', { name: 'Đăng nhập' })).toBeDefined();
    expect((screen.getByTestId('email-input') as HTMLInputElement).value).toBe('owner@example.com');
    expect(screen.getByRole('status').textContent).toContain('Mật khẩu đã được cập nhật');
  });

  it('shows only generic guidance when no development reset URL is available', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);
    await user.click(screen.getByRole('button', { name: 'Quên mật khẩu?' }));
    await user.type(screen.getByTestId('email-input'), 'unknown@example.com');
    await user.click(screen.getByRole('button', { name: 'Tiếp tục' }));
    expect((await screen.findByRole('status')).textContent).toContain('Nếu email tồn tại');
    expect(screen.queryByTestId('new-password-input')).toBeNull();
  });
});
