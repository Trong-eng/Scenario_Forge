import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AuthProvider } from '../../../../src/shared/auth/AuthContext';
import { PreferencesProvider } from '../../../../src/shared/preferences/PreferencesContext';
import { DEFAULT_PREFERENCES } from '../../../../src/shared/preferences/types';
import { SettingsDialog } from '../../../../src/components/forge/settings/SettingsDialog';
import type { LiveSession } from '../../../../src/components/forge/liveTypes';

const session = { projectId: 'proj-1', projectToken: 'tok', correlationId: 'corr' } as unknown as LiveSession;

function routed(url: string) {
  if (url.includes('/api/v1/auth/me')) {
    return new Response(JSON.stringify({ id: 'u1', email: 'a@b.c', name: 'Tuấn Lê', role: 'author', created_at: '2026-08-01T00:00:00Z' }), { status: 200 });
  }
  if (url.includes('/api/v1/me/preferences')) {
    return new Response(JSON.stringify({ preferences: DEFAULT_PREFERENCES, updated_at: '2026-08-31T00:00:00Z' }), { status: 200 });
  }
  return new Response('{}', { status: 404 });
}

beforeEach(() => {
  window.localStorage.clear();
  window.history.replaceState({}, '', '/workspace');
  vi.restoreAllMocks();
  vi.spyOn(globalThis, 'fetch').mockImplementation((input) => Promise.resolve(routed(String(input))));
});

afterEach(cleanup);

function open(props: Partial<React.ComponentProps<typeof SettingsDialog>> = {}) {
  return render(
    <AuthProvider>
      <PreferencesProvider>
        <SettingsDialog session={session} permissions={['run', 'approve']} onClose={props.onClose ?? (() => undefined)} {...props} />
      </PreferencesProvider>
    </AuthProvider>,
  );
}

it('offers every section, grouped, and opens on Account', async () => {
  open();
  const nav = await screen.findByRole('navigation', { name: 'Danh mục cài đặt' });

  for (const label of ['Tài khoản', 'Giao diện', 'Ngôn ngữ & khu vực', 'Thông báo', 'Mặc định khi chạy', 'Phím tắt', 'Bảo mật & phiên', 'Dữ liệu', 'Giới thiệu']) {
    expect(within(nav).getByRole('button', { name: label })).toBeDefined();
  }
  expect(within(nav).getByRole('button', { name: 'Tài khoản' }).getAttribute('aria-current')).toBe('true');
});

it('opens directly on a deep-linked section and writes the section back to the URL', async () => {
  const user = userEvent.setup();
  open({ initialSection: 'appearance' });

  expect(await screen.findByRole('radiogroup', { name: 'Chủ đề' })).toBeDefined();
  expect(new URL(window.location.href).searchParams.get('settings')).toBe('appearance');

  await user.click(screen.getByRole('button', { name: 'Phím tắt' }));
  expect(new URL(window.location.href).searchParams.get('settings')).toBe('shortcuts');
});

it('filters the rail by what a section actually contains, ignoring diacritics', async () => {
  const user = userEvent.setup();
  open();
  const nav = await screen.findByRole('navigation', { name: 'Danh mục cài đặt' });

  await user.type(screen.getByRole('searchbox', { name: 'Tìm trong cài đặt' }), 'mat khau');

  expect(within(nav).getByRole('button', { name: 'Bảo mật & phiên' })).toBeDefined();
  expect(within(nav).queryByRole('button', { name: 'Thông báo' })).toBeNull();
  // The panel follows the rail rather than showing a section the rail hid.
  await waitFor(() => expect(screen.getByRole('heading', { level: 3 }).textContent).toBe('Bảo mật & phiên'));
});

it('says so when nothing matches', async () => {
  const user = userEvent.setup();
  open();
  await screen.findByRole('navigation', { name: 'Danh mục cài đặt' });

  await user.type(screen.getByRole('searchbox', { name: 'Tìm trong cài đặt' }), 'zzzz');

  expect(screen.getByText(/Không có mục nào khớp/)).toBeDefined();
});

it('closes on Escape and on the close button', async () => {
  const user = userEvent.setup();
  const onClose = vi.fn();
  open({ onClose });
  await screen.findByTestId('settings-dialog');

  await user.keyboard('{Escape}');
  expect(onClose).toHaveBeenCalledTimes(1);

  await user.click(screen.getByRole('button', { name: 'Đóng cài đặt' }));
  expect(onClose).toHaveBeenCalledTimes(2);
});

it('keeps Tab inside the dialog', async () => {
  const user = userEvent.setup();
  open();
  const dialog = await screen.findByTestId('settings-dialog');

  for (let step = 0; step < 30; step += 1) {
    await user.tab();
    expect(dialog.contains(document.activeElement)).toBe(true);
  }
});
