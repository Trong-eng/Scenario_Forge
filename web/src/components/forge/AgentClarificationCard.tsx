'use client';

import { useState } from 'react';
import { MessageCircleQuestion, Send } from 'lucide-react';
import type { AgentClarificationPending } from '@/shared/api/agentTypes';
import { clarificationChoiceLabel } from './clarificationLabels';

/**
 * The agent's clarifying question, as a card of stacked choices.
 *
 * Named `AgentClarificationCard` rather than `ClarificationCard` because that
 * name previously belonged to the removed public-chat surface, which is outside this
 * column's blast radius.
 *
 * The icon is deliberately a question mark, not the `ShieldCheck` the approval
 * gate uses: a clarification asks something, it does not gate anything, and
 * borrowing the gate's chrome made "which map?" read like a security prompt.
 *
 * The secondary line shows the value that will actually be recorded, and only
 * when it differs from the label. Our clarification contract carries
 * `{ordinal, value, label}` and no description, so a prose blurb per option
 * could only be invented client-side — the same class of error as the
 * hard-coded stage strings this work removed. Showing the durable value is
 * grounded and tells the operator exactly what lands in the Definition.
 */

type Props = {
  field: string;
  prompt: string;
  choices: AgentClarificationPending['choices'];
  allowsOther: boolean;
  submitting: boolean;
  onChoose: (ordinal: number) => void;
  onAnswerOther: (text: string) => void;
};

export function AgentClarificationCard({ field, prompt, choices, allowsOther, submitting, onChoose, onAnswerOther }: Props) {
  const [otherSelected, setOtherSelected] = useState(false);
  const [answer, setAnswer] = useState('');

  return (
    <div className="w-full overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-start gap-2.5 border-b border-border bg-surface px-4 py-3">
        <MessageCircleQuestion aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <p className="text-[length:calc(14px*var(--font-scale))] font-medium leading-[1.5] text-foreground">{prompt}</p>
      </div>

      <div role="group">
        {choices.map((choice) => (
          <button
            key={choice.ordinal}
            type="button"
            disabled={submitting}
            // The recorded-value line is supporting detail, not part of the
            // control's name; without this the accessible name becomes
            // "Nắng Sẽ ghi: clear" and screen-reader users hear an identifier.
            aria-label={clarificationChoiceLabel(field, choice.label, choice.value)}
            onClick={() => onChoose(choice.ordinal)}
            className="flex w-full flex-col items-start gap-0.5 px-4 py-3 text-left outline-none transition-colors duration-150 hover:bg-surface focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40 disabled:opacity-45 [&+*]:border-t [&+*]:border-border/70"
          >
            <span className="text-[length:calc(13.5px*var(--font-scale))] font-medium text-foreground">{clarificationChoiceLabel(field, choice.label, choice.value)}</span>
            {choice.value !== choice.label ? (
              <span className="text-[length:calc(12px*var(--font-scale))] leading-[1.5] text-muted-foreground">Sẽ ghi: {choice.value}</span>
            ) : null}
          </button>
        ))}

        {allowsOther && !otherSelected ? (
          <button
            type="button"
            disabled={submitting}
            onClick={() => setOtherSelected(true)}
            className="flex w-full items-center px-4 py-3 text-left text-[length:calc(13.5px*var(--font-scale))] text-muted-foreground outline-none transition-colors duration-150 hover:bg-surface hover:text-foreground focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/40 disabled:opacity-45 [&+*]:border-t [&+*]:border-border/70 border-t border-dashed border-border"
          >
            Khác…
          </button>
        ) : null}
      </div>

      {allowsOther && otherSelected ? (
        <form
          className="flex items-center gap-2 border-t border-border px-4 py-3"
          onSubmit={(event) => {
            event.preventDefault();
            const value = answer.trim();
            if (!value || submitting) return;
            onAnswerOther(value);
          }}
        >
          <label className="sr-only" htmlFor="agent-interrupt-answer">Clarification answer</label>
          <input
            id="agent-interrupt-answer"
            autoFocus
            value={answer}
            onChange={(event) => setAnswer(event.target.value)}
            placeholder="Trả lời theo cách của bạn…"
            className="min-h-9 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-[length:calc(13px*var(--font-scale))] outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
          />
          <button
            type="submit"
            aria-label="Trả lời"
            disabled={submitting || !answer.trim()}
            className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary text-primary-foreground outline-none transition-opacity focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-45"
          >
            <Send aria-hidden="true" className="size-4" />
          </button>
        </form>
      ) : null}
    </div>
  );
}
