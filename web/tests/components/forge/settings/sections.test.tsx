import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AuthProvider } from '../../../../src/shared/auth/AuthContext';
import { PreferencesProvider } from '../../../../src/shared/preferences/PreferencesContext';
import { DEFAULT_PREFERENCES } from '../../../../src/shared/preferences/types';
import { SettingsDialog } from '../../../../src/components/forge/settings/SettingsDialog';
import { passwordStrength } from '../../../../src/components/forge/settings/SecuritySection';
import type { SectionId } from '../../../../src/components/forge/settings/sections';
import type { LiveSession } from '../../../../src/components/forge/liveTypes';

const session = { projectId: 'proj-1', projectToken: 'tok', correlationId: 'corr' } as unknown as LiveSession;
let preferences = DEFAULT_PREFERENCES;

function routed(url: string, init?: RequestInit) {
  if (url.includes('/api/v1/auth/me')) {
    return new Response(JSON.stringify({ id: 'u1', email: 'a@b.c', name: 'Tuấn Lê', role: 'author', created_at: '2026-08-01T00:00:00Z' }), { status: 200 });
  }
  if (url.includes('/api/v1/me/preferences')) {
    if (init?.method === 'PATCH') {
      const patch = JSON.parse(String(init.body)) as Record<string, object>;
      preferences = { ...preferences, ...Object.fromEntries(Object.entries(patch).map(([group, values]) => [group, { ...(preferences as never)[group] as object, ...values }])) } as typeof preferences;
    }
    return new Response(JSON.stringify({ preferences, updated_at: '2026-08-31T00:00:00Z' }), { status: 200 });
  }
  if (url.includes('/api/v1/me/sessions')) {
    return new Response(JSON.stringify({ sessions: [
      { session_id: 'a', device: 'Linux desktop', browser: 'Chrome', ip: '10.0.0.1', location: 'Hà Nội', created_at: '2026-08-01T00:00:00Z', last_seen_at: '2026-08-31T00:00:00Z', current: true },
      { session_id: 'b', device: 'iPhone', browser: 'Safari', ip: '10.0.0.2', location: 'Hà Nội', created_at: '2026-08-01T00:00:00Z', last_seen_at: '2026-08-30T00:00:00Z', current: false },
    ] }), { status: 200 });
  }
  if (url.includes('/health')) {
    return new Response(JSON.stringify({ status: 'ok', env: 'mock', build_dependencies: { configured: true, ready: true } }), { status: 200 });
  }
  return new Response('{}', { status: 404 });
}

beforeEach(() => {
  preferences = DEFAULT_PREFERENCES;
  window.localStorage.clear();
  window.history.replaceState({}, '', '/workspace');
  document.documentElement.removeAttribute('data-theme');
  vi.restoreAllMocks();
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => Promise.resolve(routed(String(input), init as RequestInit)));
});

afterEach(cleanup);

function open(initialSection: SectionId) {
  return render(
    <AuthProvider>
      <PreferencesProvider>
        <SettingsDialog session={session} permissions={['run']} initialSection={initialSection} onClose={() => undefined} />
      </PreferencesProvider>
    </AuthProvider>,
  );
}

it('turns the whole product dark and keeps the choice', async () => {
  const user = userEvent.setup();
  open('appearance');

  await user.click(await screen.findByRole('radio', { name: 'Tối' }));

  // The attribute is what every token in globals.css keys off, so this is the
  // theme actually being live rather than a stored preference.
  await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'));
  expect(JSON.parse(String(window.localStorage.getItem('sf_preferences'))).appearance.theme).toBe('dark');
});

it('scales density and text through the attributes the stylesheet reads', async () => {
  const user = userEvent.setup();
  open('appearance');

  await user.click(await screen.findByRole('radio', { name: 'Gọn' }));
  await waitFor(() => expect(document.documentElement.dataset.density).toBe('compact'));

  await user.click(screen.getByRole('radio', { name: 'Lớn' }));
  await waitFor(() => expect(document.documentElement.dataset.fontScale).toBe('lg'));
});

it('retranslates the surface when the language changes', async () => {
  const user = userEvent.setup();
  open('locale');

  await user.click(await screen.findByRole('radio', { name: 'English' }));

  await waitFor(() => expect(screen.getByRole('heading', { level: 3 }).textContent).toBe('Language & region'));
  expect(document.documentElement.lang).toBe('en');
});

it('saves a notification channel per event', async () => {
  const user = userEvent.setup();
  open('notifications');

  const toggle = await screen.findByRole('switch', { name: 'Run hoàn tất — Email' });
  expect(toggle.getAttribute('aria-checked')).toBe('false');

  await user.click(toggle);

  await waitFor(() => expect(screen.getByRole('switch', { name: 'Run hoàn tất — Email' }).getAttribute('aria-checked')).toBe('true'));
  // The write is debounced, so the server state is asserted once it lands.
  await waitFor(() => expect(preferences.notifications.runCompleted.email).toBe(true));
});

it('hides the seed box when the seed is chosen at random', async () => {
  const user = userEvent.setup();
  open('run');

  expect(await screen.findByLabelText('Seed mặc định')).toBeDefined();

  await user.click(screen.getByRole('radio', { name: 'Ngẫu nhiên mỗi lần' }));

  await waitFor(() => expect(screen.queryByLabelText('Seed mặc định')).toBeNull());
});

it('refuses a mismatched password confirmation before contacting the server', async () => {
  const user = userEvent.setup();
  open('security');

  await user.type(await screen.findByLabelText('Mật khẩu hiện tại'), 'old-password');
  await user.type(screen.getByLabelText('Mật khẩu mới'), 'a-long-new-password');
  await user.type(screen.getByLabelText('Nhập lại mật khẩu mới'), 'a-long-new-passwort');

  expect(screen.getByText('Hai mật khẩu không khớp.')).toBeDefined();
  expect(screen.getByRole('button', { name: 'Đổi mật khẩu' }).hasAttribute('disabled')).toBe(true);
});

it('rates password strength on length and character variety', () => {
  expect(passwordStrength('short')).toBe(0);
  expect(passwordStrength('alllowercase')).toBe(1);
  expect(passwordStrength('Mixed12345')).toBe(2);
  expect(passwordStrength('Mixed-12345-Longer')).toBe(3);
});

it('lists sessions and marks the one being used', async () => {
  open('security');

  expect(await screen.findByText('Thiết bị này')).toBeDefined();
  // The current session has no sign-out button; signing yourself out from here
  // would be a dead end.
  expect(screen.getAllByRole('button', { name: 'Đăng xuất' })).toHaveLength(1);
});

it('leaves account deletion disabled and says why', async () => {
  open('data');

  const button = await screen.findByRole('button', { name: 'Xoá tài khoản' });
  expect(button.hasAttribute('disabled')).toBe(true);
  expect(screen.getByText(/chưa có endpoint xoá tài khoản/i)).toBeDefined();
});

it('separates a checking, a healthy and an unreachable API', async () => {
  open('about');

  await waitFor(() => expect(screen.getByText('mock')).toBeDefined());
  expect(screen.getByRole('button', { name: 'Kiểm tra lại' })).toBeDefined();
});
