import { cleanup, render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { GLOBAL_SHORTCUTS, SHORTCUTS, renderKey } from '../../../src/shared/shortcuts/registry';
import { useGlobalShortcuts, type ShortcutHandlers } from '../../../src/shared/shortcuts/useGlobalShortcuts';

afterEach(cleanup);

function Harness({ handlers }: { handlers: ShortcutHandlers }) {
  useGlobalShortcuts(handlers);
  return <input aria-label="composer" />;
}

const spies = (): ShortcutHandlers => ({
  openSettings: vi.fn(), openShortcuts: vi.fn(), focusComposer: vi.fn(), toggleSidebar: vi.fn(),
});

it('never lists a global shortcut without something to run', () => {
  const handlers = spies();

  // The Shortcuts section renders straight from this registry, so an entry with
  // no handler would be a table row that lies.
  for (const entry of GLOBAL_SHORTCUTS) {
    expect(typeof handlers[entry.action]).toBe('function');
  }
  expect(GLOBAL_SHORTCUTS.length).toBe(Object.keys(handlers).length);
});

it('gives every registry entry keys and a label', () => {
  for (const entry of SHORTCUTS) {
    expect(entry.keys.length).toBeGreaterThan(0);
    expect(entry.label.trim().length).toBeGreaterThan(0);
  }
});

it('runs the modifier shortcuts', async () => {
  const user = userEvent.setup();
  const handlers = spies();
  render(<Harness handlers={handlers} />);

  await user.keyboard('{Control>},{/Control}');
  expect(handlers.openSettings).toHaveBeenCalledTimes(1);

  await user.keyboard('{Control>}b{/Control}');
  expect(handlers.toggleSidebar).toHaveBeenCalledTimes(1);

  await user.keyboard('{Control>}k{/Control}');
  expect(handlers.focusComposer).toHaveBeenCalledTimes(1);
});

it('does not swallow "?" while the user is typing', async () => {
  const user = userEvent.setup();
  const handlers = spies();
  const { getByLabelText } = render(<Harness handlers={handlers} />);

  await user.click(getByLabelText('composer'));
  await user.keyboard('?');
  expect(handlers.openShortcuts).not.toHaveBeenCalled();

  await user.click(document.body);
  await user.keyboard('?');
  expect(handlers.openShortcuts).toHaveBeenCalledTimes(1);
});

it('renders the modifier for the platform it is on', () => {
  expect(renderKey('mod', true)).toBe('⌘');
  expect(renderKey('mod', false)).toBe('Ctrl');
  expect(renderKey('K', false)).toBe('K');
});
