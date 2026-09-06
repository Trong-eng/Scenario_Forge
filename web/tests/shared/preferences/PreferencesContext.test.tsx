import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AuthProvider } from '../../../src/shared/auth/AuthContext';
import { PreferencesProvider, usePreferences } from '../../../src/shared/preferences/PreferencesContext';
import { DEFAULT_PREFERENCES } from '../../../src/shared/preferences/types';
import { LEGACY_SEED_KEY } from '../../../src/shared/preferences/applyPreferences';

function Probe() {
  const { preferences, sync, update, error } = usePreferences();
  return (
    <div>
      <span data-testid="sync">{sync}</span>
      <span data-testid="seed">{preferences.run.defaultSeed}</span>
      <span data-testid="theme">{preferences.appearance.theme}</span>
      <span data-testid="error">{error ?? ''}</span>
      <button type="button" onClick={() => update('appearance', { theme: 'dark' })}>go dark</button>
    </div>
  );
}

const body = (overrides: object = {}) => ({
  preferences: { ...DEFAULT_PREFERENCES, ...overrides },
  updated_at: '2026-08-31T00:00:00Z',
});

const account = { id: 'u1', email: 'a@b.c', name: 'Tuấn Lê', role: 'author' };

/** Preferences belong to an account, so every case here needs one signed in;
 *  the anonymous case is covered by its own test. */
function signedIn(preferenceResponses: Response[]) {
  let index = 0;
  return vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    if (String(input).includes('/api/v1/auth/me')) return Promise.resolve(new Response(JSON.stringify(account), { status: 200 }));
    const response = preferenceResponses[Math.min(index, preferenceResponses.length - 1)];
    index += 1;
    return Promise.resolve(response.clone());
  });
}

const tree = (
  <AuthProvider>
    <PreferencesProvider><Probe /></PreferencesProvider>
  </AuthProvider>
);

beforeEach(() => {
  window.localStorage.clear();
  // AuthProvider treats "/" as the public landing and skips its identity probe,
  // so these cases have to sit on a real route to have a session at all.
  window.history.replaceState({}, '', '/workspace');
  vi.restoreAllMocks();
});

afterEach(cleanup);

it('hydrates from the server and reports the account as synced', async () => {
  signedIn([new Response(JSON.stringify(body({ run: { ...DEFAULT_PREFERENCES.run, defaultSeed: '777' } })), { status: 200 })]);

  render(tree);

  await waitFor(() => expect(screen.getByTestId('sync').textContent).toBe('synced'));
  expect(screen.getByTestId('seed').textContent).toBe('777');
});

it('falls back to this browser when the endpoint is not there', async () => {
  signedIn([new Response('{}', { status: 404 })]);

  render(tree);

  // A missing preferences endpoint is the expected state against the real
  // backend, so it downgrades to local rather than showing an error.
  await waitFor(() => expect(screen.getByTestId('sync').textContent).toBe('local'));
  expect(screen.getByTestId('error').textContent).toBe('');
});

it('adopts the seed the old dialog left behind, once', async () => {
  window.localStorage.setItem(LEGACY_SEED_KEY, '2024');
  signedIn([new Response('{}', { status: 404 })]);

  render(tree);

  await waitFor(() => expect(screen.getByTestId('seed').textContent).toBe('2024'));
});

it('applies a change immediately and rolls it back when the save fails', async () => {
  const user = userEvent.setup();
  const fetchMock = signedIn([
    new Response(JSON.stringify(body()), { status: 200 }),
    new Response(JSON.stringify({ detail: { code: 'NOPE', message: 'Máy chủ từ chối.' } }), { status: 500 }),
  ]);

  render(tree);
  await waitFor(() => expect(screen.getByTestId('sync').textContent).toBe('synced'));

  await user.click(screen.getByRole('button', { name: 'go dark' }));
  // Optimistic: the theme is live before the server has answered.
  expect(screen.getByTestId('theme').textContent).toBe('dark');

  await waitFor(() => expect(screen.getByTestId('sync').textContent).toBe('error'));
  expect(screen.getByTestId('theme').textContent).toBe('light');
  expect(screen.getByTestId('error').textContent).toBe('Máy chủ từ chối.');
  expect(fetchMock.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === 'PATCH')).toBe(true);
});

it('asks the server for nothing at all when nobody is signed in', async () => {
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 404 }));

  // The public landing page renders this provider; an anonymous visitor must
  // not produce an account-scoped request.
  render(<PreferencesProvider><Probe /></PreferencesProvider>);

  await waitFor(() => expect(screen.getByTestId('sync').textContent).toBe('local'));
  expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('/me/preferences'))).toHaveLength(0);
});

it('sends only the group that changed', async () => {
  const user = userEvent.setup();
  const fetchMock = signedIn([
    new Response(JSON.stringify(body()), { status: 200 }),
    new Response(JSON.stringify(body({ appearance: { ...DEFAULT_PREFERENCES.appearance, theme: 'dark' } })), { status: 200 }),
  ]);

  render(tree);
  await waitFor(() => expect(screen.getByTestId('sync').textContent).toBe('synced'));

  await user.click(screen.getByRole('button', { name: 'go dark' }));

  await waitFor(() => {
    const patch = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === 'PATCH');
    expect(JSON.parse(String((patch?.[1] as RequestInit).body))).toEqual({ appearance: { theme: 'dark' } });
  });
});
