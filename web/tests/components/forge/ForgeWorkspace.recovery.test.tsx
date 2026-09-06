import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { RecoveryCard } from '../../../src/components/forge/ForgeWorkspace';
import type { RecoveryRequiredResult } from '../../../src/shared/api/schemas';

const recovery: RecoveryRequiredResult = {
  recovery_required: true as const,
  reason_code: 'UNSUPPORTED_SEMANTICS',
  source: {
    project_id: 'project-a', definition_id: 'definition-a', definition_version: 1,
    definition_version_id: 'dv-secret', content_hash: 'sha256:' + 'a'.repeat(64),
  },
  recovery: {
    recovery_id: 'recovery-secret', project_id: 'project-a', actor_ref: 'actor-secret',
    source_definition_version_id: 'dv-secret', source_definition_id: 'definition-a', source_version: 1,
    source_content_hash: 'sha256:' + 'a'.repeat(64), recovery_session_id: 'session-secret', requested_target: 'buildable' as const,
    status: 'OPEN' as const, consent_state: 'PENDING' as const, acquisition_action_key: 'action-secret',
    acquisition_action_digest: 'sha256:' + 'b'.repeat(64), consent_action_key: null, consent_action_digest: null,
    publish_action_key: null, publish_action_digest: null, successor_definition_version_id: null, state_version: 1,
    correlation_id: 'corr-secret', reason_code: 'UNSUPPORTED_SEMANTICS', terminal_outcome: null,
    created_at: '2026-08-23T00:00:00Z', updated_at: '2026-08-23T00:00:00Z', schema_version: '1.0.0',
  },
  allowed_actions: ['approve', 'cancel', 'refresh'],
};

it('shows safe v1 recovery copy and consent actions without raw identifiers', () => {
  const onConsent = vi.fn();
  render(<RecoveryCard recovery={recovery} busy={false} onConsent={onConsent} />);

  expect(screen.getByRole('region', { name: 'Definition recovery' })).toBeDefined();
  expect(screen.getByText('Definition v1 remains unchanged')).toBeDefined();
  expect(screen.getByText('Create v2 and keep v1 unchanged')).toBeDefined();
  expect(screen.getByText('Cancel and leave v1 as-is')).toBeDefined();
  expect(screen.queryByText('dv-secret')).toBeNull();
  expect(screen.queryByText(/sha256:/)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Create v2 and keep v1 unchanged' }));
  expect(onConsent).toHaveBeenCalledWith('approve');
});

it('renders terminal publish/cancel races as safe lineage outcomes', () => {
  const terminal: RecoveryRequiredResult = {
    ...recovery,
    recovery: {
      ...recovery.recovery,
      status: 'SUCCESSOR_PUBLISHED',
      consent_state: 'APPROVED',
      successor_definition_version_id: 'dv-successor-secret',
      terminal_outcome: 'PUBLISHED_BEFORE_CANCEL',
    },
  };
  render(<RecoveryCard recovery={terminal} busy={false} onConsent={vi.fn()} />);

  expect(screen.getByText('A v2 was published before cancellation; the workspace will reconcile its progress.')).toBeDefined();
  expect(screen.getByText('Definition v1 remains unchanged')).toBeDefined();
  expect(screen.queryByText('dv-successor-secret')).toBeNull();
  expect(screen.queryByText(/sha256:/)).toBeNull();
});
