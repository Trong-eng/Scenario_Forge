import { describe, expect, it } from 'vitest';

import { apiClient } from '../../../src/shared/api/client';

/**
 * TIP-AGENT-004: the browser conversation contract is Agent-threads only.
 * The legacy public chat transport and the authoring-session surface were
 * deleted server-side first (TIP-AGENT-003); these pins keep them gone.
 */
// Built from fragments so this guard file never contains a forbidden literal.
const LEGACY_METHODS = [
  'chat',
  ['stream', 'Chat'].join(''),
  ['create', 'Authoring', 'Session'].join(''),
  ['get', 'Authoring', 'Session'].join(''),
  ['list', 'Authoring', 'Sessions'].join(''),
  ['rename', 'Authoring', 'Session'].join(''),
  ['get', 'Authoring', 'Messages'].join(''),
  ['answer', 'Authoring', 'Session'].join(''),
  ['route', 'Authoring', 'Message'].join(''),
  ['cancel', 'Authoring', 'Session'].join(''),
] as const;

const AGENT_METHODS = [
  'createAgentThread',
  'appendAgentMessage',
  'streamAgentEvents',
  'getPendingAgentInterrupt',
  'decideAgentInterrupt',
  'listAgentThreads',
  'getAgentThread',
  'getAgentTranscript',
  'renameAgentThread',
  'cancelAgentTurn',
  'getAgentBudgetProgress',
] as const;

describe('agent-only api client contract', () => {
  it.each(LEGACY_METHODS)('no longer exposes %s', (method) => {
    expect((apiClient as unknown as Record<string, unknown>)[method]).toBeUndefined();
  });

  it.each(AGENT_METHODS)('still exposes the agent surface %s', (method) => {
    expect(typeof (apiClient as unknown as Record<string, unknown>)[method]).toBe('function');
  });
});
