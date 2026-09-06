import { describe, expect, it } from 'vitest';
import { definitionReferenceFromEvent, shouldAcceptPublishedDefinition } from '../../../src/components/forge/AgentThreadPanel';
import type { AgentEvent } from '../../../src/shared/api/agentTypes';

describe('agent definition publication fencing', () => {
  it('accepts a definition only while the callback belongs to the active thread', () => {
    expect(shouldAcceptPublishedDefinition('thread-1', 'thread-1')).toBe(true);
    expect(shouldAcceptPublishedDefinition('thread-1', 'thread-2')).toBe(false);
    expect(shouldAcceptPublishedDefinition(null, 'thread-1')).toBe(false);
  });

  const event = (payload: Record<string, unknown>): AgentEvent => ({
    event_id: 'event-1', cursor: 1, event_type: 'tool_result', thread_id: 'thread-1',
    step_id: 'author', correlation_id: 'corr-1', payload, created_at: '2026-09-01T00:00:00Z',
  });

  it('accepts only a successful author_definition result with an exact version', () => {
    expect(definitionReferenceFromEvent(event({
      tool_name: 'author_definition', status: 'success', definition_id: 'definition-1', definition_version: 2,
    }))).toEqual({ definitionId: 'definition-1', version: 2 });
    expect(definitionReferenceFromEvent(event({
      tool_name: 'author_definition', status: 'failed', definition_id: 'definition-1', definition_version: 2,
    }))).toBeNull();
    expect(definitionReferenceFromEvent(event({
      tool_name: 'ground_definition', status: 'success', definition_id: 'definition-1', definition_version: 2,
    }))).toBeNull();
  });

  it('projects the durable author_definition domain reference as the exact DefinitionVersion identity', () => {
    expect(definitionReferenceFromEvent(event({
      tool_name: 'author_definition', status: 'success', definition_id: 'definition-1',
      domain_refs: ['dv-definition-1-3', 'definition-1'],
    }))).toEqual({
      definitionId: 'definition-1', version: null, definitionVersionId: 'dv-definition-1-3',
    });
  });
});
