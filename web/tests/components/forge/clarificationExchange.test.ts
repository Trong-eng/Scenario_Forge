import { describe, expect, it } from 'vitest';
import { projectClarificationExchanges } from '../../../src/components/forge/clarificationExchange';
import type { AgentEvent, AgentTranscriptMessage } from '../../../src/shared/api/agentTypes';

const event = (
  cursor: number,
  eventType: AgentEvent['event_type'],
  payload: Record<string, unknown>,
): AgentEvent => ({
  event_id: `event-${cursor}`,
  cursor,
  event_type: eventType,
  thread_id: 'thread-1',
  step_id: null,
  correlation_id: 'corr-safe',
  payload,
  created_at: '2026-08-23T00:00:00Z',
});

describe('projectClarificationExchanges', () => {
  it('binds a durable answer to the agent question by interrupt and message IDs', () => {
    const transcript: AgentTranscriptMessage[] = [{
      message_id: 'message-answer',
      role: 'user',
      safe_summary: 'weather: clear',
      created_at: '2026-08-23T00:00:02Z',
    }];
    const result = projectClarificationExchanges([
      event(1, 'interrupt_required', {
        interrupt_id: 'interrupt-weather',
        kind: 'clarification',
        clarification: {
          field: 'weather',
          prompt: 'Thời tiết của scenario là gì?',
          choices: [
            { ordinal: 1, value: 'clear', label: 'Nắng' },
            { ordinal: 2, value: 'rain', label: 'Mưa' },
          ],
          allows_other: true,
        },
      }),
      event(2, 'interrupt_resolved', {
        interrupt_id: 'interrupt-weather',
        decision: 'answer',
        message_id: 'message-answer',
      }),
    ], transcript);

    expect(result.exchanges).toEqual([expect.objectContaining({
      interruptId: 'interrupt-weather',
      field: 'weather',
      prompt: 'Thời tiết của scenario là gì?',
      answer: 'Nắng',
      resolved: true,
    })]);
    expect(result.consumedMessageIds.has('message-answer')).toBe(true);
  });

  it('uses neutral copy when the durable answer row is temporarily unavailable', () => {
    const result = projectClarificationExchanges([
      event(1, 'interrupt_required', {
        interrupt_id: 'interrupt-gap',
        kind: 'clarification',
        clarification: {
          field: 'gap',
          prompt: 'Khoảng cách kích hoạt là bao nhiêu?',
          choices: [],
          allows_other: true,
        },
      }),
      event(2, 'interrupt_resolved', {
        interrupt_id: 'interrupt-gap',
        decision: 'answer',
        message_id: 'message-answer',
      }),
    ], []);

    expect(result.exchanges[0]).toEqual(expect.objectContaining({
      answer: 'Đã ghi nhận câu trả lời',
      resolved: true,
    }));
    expect(result.consumedMessageIds.has('message-answer')).toBe(true);
  });

  it('replays subject-qualified answers through the same canonical formatter', () => {
    const result = projectClarificationExchanges([
      event(1, 'interrupt_required', {
        interrupt_id: 'interrupt-role',
        kind: 'clarification',
        clarification: {
          field: 'role', subject: 'pedestrian', prompt: 'Vai trò của pedestrian?',
          choices: [{ ordinal: 1, value: 'actor', label: 'actor' }], allows_other: false,
        },
      }),
      event(2, 'interrupt_resolved', {
        interrupt_id: 'interrupt-role', decision: 'answer', message_id: 'role-answer',
      }),
    ], [{
      message_id: 'role-answer', role: 'user', safe_summary: 'Role (pedestrian): actor',
      created_at: '2026-08-23T00:00:02Z',
    }]);

    expect(result.exchanges[0]?.answer).toBe('Đối tượng tham gia');
  });
});
