import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LoginPage } from '@/features/auth/LoginPage';

const auth = vi.hoisted(() => ({
  loginWithGoogle: vi.fn(), login: vi.fn(), register: vi.fn(),
  forgotPassword: vi.fn(), resetPassword: vi.fn(), logout: vi.fn(),
  isLoading: false, isAuthenticated: false,
}));

vi.mock('@/shared/auth/AuthContext', () => ({ useAuth: () => auth }));

describe('LoginPage credential fields', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  });

  it('names every credential field with a label instead of a placeholder alone', () => {
    render(<LoginPage />);
    expect(screen.getByLabelText('Địa chỉ e-mail')).toBe(screen.getByTestId('email-input'));
    expect(screen.getByLabelText('Mật khẩu')).toBe(screen.getByTestId('password-input'));
  });

  it('reveals and re-masks the password without touching the value', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);
    const input = screen.getByTestId('password-input') as HTMLInputElement;
    await user.type(input, 'MatKhau12345');
    expect(input.type).toBe('password');

    await user.click(screen.getByRole('button', { name: 'Hiện mật khẩu' }));
    expect(input.type).toBe('text');
    expect(input.value).toBe('MatKhau12345');

    await user.click(screen.getByRole('button', { name: 'Ẩn mật khẩu' }));
    expect(input.type).toBe('password');
    expect(input.value).toBe('MatKhau12345');
  });

  it('reveals the confirmation field independently of the first password', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);
    await user.click(screen.getByRole('button', { name: 'Tạo tài khoản mới' }));

    await user.click(screen.getByRole('button', { name: 'Hiện mật khẩu nhập lại' }));
    expect((screen.getByTestId('password-confirmation-input') as HTMLInputElement).type).toBe('text');
    expect((screen.getByTestId('password-input') as HTMLInputElement).type).toBe('password');
  });

  it('states the password rules while typing rather than only on a failed submit', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);
    await user.click(screen.getByRole('button', { name: 'Tạo tài khoản mới' }));

    const rules = () => screen.getAllByRole('listitem').map((li) => li.textContent);
    expect(rules()).toEqual(['Tối thiểu 8 ký tự', 'Hai lần nhập khớp nhau']);

    await user.type(screen.getByTestId('password-input'), 'MatKhau12345');
    await user.type(screen.getByTestId('password-confirmation-input'), 'KhongTrung');

    const [lengthRule, matchRule] = screen.getAllByRole('listitem');
    expect(lengthRule.className).toContain('requirementMet');
    expect(matchRule.className).not.toContain('requirementMet');
    expect(screen.getByTestId('password-confirmation-input').getAttribute('aria-invalid')).toBe('true');

    await user.clear(screen.getByTestId('password-confirmation-input'));
    await user.type(screen.getByTestId('password-confirmation-input'), 'MatKhau12345');
    expect(screen.getAllByRole('listitem')[1].className).toContain('requirementMet');
    expect(screen.getByTestId('password-confirmation-input').getAttribute('aria-invalid')).toBe('false');
  });

  it('shows the reset address as read-only so it reads as confirmation, not input', async () => {
    const user = userEvent.setup();
    auth.forgotPassword.mockResolvedValue({
      detail: 'Đã gửi.', reset_url: 'http://localhost/reset-password?token=t',
    });
    render(<LoginPage />);
    await user.click(screen.getByRole('button', { name: 'Quên mật khẩu?' }));
    await user.type(screen.getByTestId('email-input'), 'owner@example.com');
    await user.click(screen.getByRole('button', { name: 'Tiếp tục' }));

    const email = await screen.findByTestId('email-input');
    expect((email as HTMLInputElement).readOnly).toBe(true);
  });

  it('warns while Caps Lock is on and clears the warning on blur', async () => {
    const user = userEvent.setup();
    render(<LoginPage />);
    const input = screen.getByTestId('password-input');

    await user.click(input);
    await user.keyboard('{CapsLock}a');
    expect(screen.getByTestId('caps-lock-hint').textContent).toContain('Caps Lock');

    await user.tab();
    expect(screen.queryByTestId('caps-lock-hint')).toBeNull();
  });
});
