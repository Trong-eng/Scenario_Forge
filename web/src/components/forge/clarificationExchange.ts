import type { AgentClarificationChoice, AgentEvent, AgentTranscriptMessage } from '@/shared/api/agentTypes';
import { clarificationChoiceLabel, clarificationValueLabel } from './clarificationLabels';

export type ClarificationExchange = {
  interruptId: string;
  field: string;
  prompt: string;
  choices: readonly AgentClarificationChoice[];
  subject?: string;
  answer: string | null;
  resolved: boolean;
};

export type ClarificationProjection = {
  exchanges: ClarificationExchange[];
  consumedMessageIds: Set<string>;
};

function clarificationFrom(event: AgentEvent): ClarificationExchange | null {
  if (event.event_type !== 'interrupt_required') return null;
  const payload = event.payload;
  const raw = payload.clarification;
  if (payload.kind !== 'clarification' || typeof payload.interrupt_id !== 'string' || !raw || typeof raw !== 'object') return null;
  const clarification = raw as Record<string, unknown>;
  if (typeof clarification.field !== 'string' || typeof clarification.prompt !== 'string' || !Array.isArray(clarification.choices)) return null;
  const choices = clarification.choices.filter((choice): choice is AgentClarificationChoice => {
    if (!choice || typeof choice !== 'object') return false;
    const item = choice as Record<string, unknown>;
    return Number.isInteger(item.ordinal) && typeof item.value === 'string' && typeof item.label === 'string';
  });
  return {
    interruptId: payload.interrupt_id,
    field: clarification.field,
    prompt: clarification.prompt,
    choices,
    subject: typeof clarification.subject === 'string' ? clarification.subject : undefined,
    answer: null,
    resolved: false,
  };
}

function displayAnswer(exchange: ClarificationExchange, summary: string | undefined): string {
  if (!summary) return 'Đã ghi nhận câu trả lời';
  const prefixes = [
    `${exchange.field}:`,
    exchange.subject ? `${exchange.subject} ${exchange.field}:` : '',
    exchange.subject ? `${exchange.field} (${exchange.subject}):` : '',
  ];
  const normalized = prefixes.reduce((value, prefix) => (
    prefix && value.toLowerCase().startsWith(prefix.toLowerCase()) ? value.slice(prefix.length).trim() : value
  ), summary.trim());
  const choice = exchange.choices.find((item) => item.value.toLowerCase() === normalized.toLowerCase()
    || item.label.toLowerCase() === normalized.toLowerCase());
  return choice
    ? clarificationChoiceLabel(exchange.field, choice.label, choice.value)
    : clarificationValueLabel(exchange.field, normalized) || 'Đã ghi nhận câu trả lời';
}

/**
 * Rebuild question/answer pairs from durable IDs. Text is display-only and is
 * never used to guess which answer belongs to which interrupt.
 */
export function projectClarificationExchanges(
  events: readonly AgentEvent[],
  transcript: readonly AgentTranscriptMessage[],
): ClarificationProjection {
  const transcriptById = new Map(transcript.map((message) => [message.message_id, message.safe_summary]));
  const exchangesById = new Map<string, ClarificationExchange>();
  const order: string[] = [];
  const consumedMessageIds = new Set<string>();

  for (const event of events) {
    const asked = clarificationFrom(event);
    if (asked) {
      if (!exchangesById.has(asked.interruptId)) order.push(asked.interruptId);
      exchangesById.set(asked.interruptId, asked);
      continue;
    }
    if (event.event_type !== 'interrupt_resolved' || event.payload.decision !== 'answer') continue;
    const interruptId = event.payload.interrupt_id;
    const messageId = event.payload.message_id;
    if (typeof interruptId !== 'string' || typeof messageId !== 'string') continue;
    consumedMessageIds.add(messageId);
    const exchange = exchangesById.get(interruptId);
    if (!exchange) continue;
    exchangesById.set(interruptId, {
      ...exchange,
      answer: displayAnswer(exchange, transcriptById.get(messageId)),
      resolved: true,
    });
  }

  return { exchanges: order.map((id) => exchangesById.get(id)).filter((item): item is ClarificationExchange => Boolean(item)), consumedMessageIds };
}
