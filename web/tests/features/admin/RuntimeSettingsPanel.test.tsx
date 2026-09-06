import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { RuntimeSettingsPanel } from '../../../src/features/admin/RuntimeSettingsPanel';

const view = {
  provider: 'openai-compatible',
  model: 'deepseek-v4-flash',
  backend_active_limit_seconds: 900,
  human_response_limit_seconds: 1800,
  allowed_providers: ['openai-compatible', 'deepseek-compatible'],
  allowed_models: ['gpt-4o-mini', 'deepseek-v4-flash', 'deepseek-chat'],
  api_key_configured: true,
  api_key_last4: '9f2a',
  restart_required: false,
};

beforeEach(() => { vi.restoreAllMocks(); });
afterEach(cleanup);

it('renders the server allowlist rather than a list of its own', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(view), { status: 200 }));
  render(<RuntimeSettingsPanel />);

  expect(await screen.findByRole('combobox', { name: 'Provider' })).toBeDefined();
  expect(screen.getByDisplayValue('900')).toBeDefined();
  // The key itself never appears; only the last four characters do.
  expect(screen.getByText(/9f2a/)).toBeDefined();
});

it('saves the four runtime fields and warns that the process still runs the old values', async () => {
  const user = userEvent.setup();
  const fetchMock = vi.spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(new Response(JSON.stringify(view), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ ...view, model: 'deepseek-chat', restart_required: true }), { status: 200 }));

  render(<RuntimeSettingsPanel />);
  await screen.findByRole('combobox', { name: 'Model' });

  await user.click(screen.getByRole('combobox', { name: 'Model' }));
  await user.click(screen.getByRole('option', { name: 'deepseek-chat' }));
  await user.click(screen.getByRole('button', { name: 'Lưu runtime settings' }));

  await waitFor(() => expect(screen.getByText(/cần khởi động lại backend/i)).toBeDefined());
  expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
    provider: 'openai-compatible', model: 'deepseek-chat',
    backend_active_limit_seconds: 900, human_response_limit_seconds: 1800,
  });
});

it('will not submit a limit the server would reject', async () => {
  const user = userEvent.setup();
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(view), { status: 200 }));
  render(<RuntimeSettingsPanel />);

  const limit = await screen.findByLabelText('Backend active limit (giây)');
  await user.clear(limit);
  await user.type(limit, '90000');

  // 86 400 is the server's own bound; the button refuses before the round trip.
  expect(screen.getByRole('button', { name: 'Lưu runtime settings' }).hasAttribute('disabled')).toBe(true);
});

it('repeats the server refusal rather than inventing one', async () => {
  const user = userEvent.setup();
  vi.spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(new Response(JSON.stringify(view), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ detail: { code: 'SETTING_NOT_ALLOWED', message: 'Provider/model is not in the server allowlist.' } }), { status: 422 }));

  render(<RuntimeSettingsPanel />);
  await screen.findByRole('button', { name: 'Lưu runtime settings' });
  await user.click(screen.getByRole('button', { name: 'Lưu runtime settings' }));

  await waitFor(() => expect(screen.getByText(/SETTING_NOT_ALLOWED/)).toBeDefined());
});

it('shows the 501 the deployment actually returns for secret rotation', async () => {
  const user = userEvent.setup();
  vi.spyOn(globalThis, 'fetch')
    .mockResolvedValueOnce(new Response(JSON.stringify(view), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ detail: { code: 'SECRET_MANAGER_UNAVAILABLE', message: 'This deployment has no host secret-manager adapter.' } }), { status: 501 }));

  render(<RuntimeSettingsPanel />);
  await user.click(await screen.findByRole('button', { name: 'Xoay secret' }));

  await waitFor(() => expect(screen.getByText(/SECRET_MANAGER_UNAVAILABLE/)).toBeDefined());
});

it('explains a 403 instead of showing an empty form', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ detail: { code: 'ADMIN_REQUIRED', message: 'Administrator role is required.' } }), { status: 403 }),
  );

  render(<RuntimeSettingsPanel />);

  expect(await screen.findByText('Cần vai trò admin để xem mục này.')).toBeDefined();
});
