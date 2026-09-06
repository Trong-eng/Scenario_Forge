import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Check, ChevronDown, ChevronRight, CircleX, Copy, RotateCcw, Wrench } from 'lucide-react';
import { emptyEphemeralDraft, type AgentEphemeralDraft, type AgentEvent } from '@/shared/api/agentTypes';
import { cn } from '@/lib/utils';
import { projectAgentActivity, projectEphemeralDraft, type ActivityViewRow } from './agentActivityView';
import { AgentMarkdown } from './AgentMarkdown';
import { useStreamingText } from './useStreamingText';

type Props = {
  events?: readonly AgentEvent[];
  /** Turn-in-flight draft assembled from ephemeral frames (ADR-0008). */
  draft?: AgentEphemeralDraft;
  awaitingFirstEvent?: boolean;
  /** The operator asked to stop; finish revealing what arrived and drop the caret. */
  stopRequested?: boolean;
  startedAtMs?: number | null;
  onSettled?: (durationMs: number) => void;
  /** Resubmit this turn's prompt. Absent hides the retry action. */
  onRetry?: () => void;
  /** Called on each reveal frame so the viewport can stay pinned to the bottom. */
  onRevealFrame?: () => void;
  /** Opens the read-only capability catalogue from a capability answer. */
  onOpenCapabilities?: () => void;
  reducedMotion?: boolean;
};

const COPY_CONFIRMATION_MS = 1600;

const durationFormat = new Intl.NumberFormat('vi-VN', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

function formatDuration(durationMs: number) {
  return `${durationFormat.format(Math.max(0.1, durationMs / 1000))} giây`;
}

function currentTurnEvents(events: readonly AgentEvent[]) {
  if (!events.length) return [];
  const lastIsTerminal = ['completed', 'failed'].includes(events.at(-1)?.event_type ?? '');
  const searchEnd = lastIsTerminal ? events.length - 2 : events.length - 1;
  for (let index = searchEnd; index >= 0; index -= 1) {
    if (['completed', 'failed'].includes(events[index]?.event_type ?? '')) return events.slice(index + 1);
  }
  return [...events];
}

function historicalDuration(events: readonly AgentEvent[]) {
  if (events.length < 2) return null;
  const first = Date.parse(events[0]?.created_at ?? '');
  const last = Date.parse(events.at(-1)?.created_at ?? '');
  const duration = last - first;
  return Number.isFinite(duration) && duration > 0 ? duration : null;
}

function turnKey(events: readonly AgentEvent[]) {
  const first = events[0];
  return first ? `${first.thread_id}:${first.cursor}` : 'empty';
}

function rowIcon(row: ActivityViewRow) {
  if (row.state === 'failed') return <CircleX aria-hidden="true" className="size-4 shrink-0 text-destructive" />;
  if (row.kind === 'tool') return <Wrench aria-hidden="true" className="size-4 shrink-0" />;
  return null;
}

function ActiveText({ children, active, reducedMotion, className }: { children: string; active: boolean; reducedMotion: boolean; className?: string }) {
  const animated = active && !reducedMotion;
  return <span
    data-active-shimmer={animated ? 'true' : undefined}
    data-shimmer-sweep={animated ? 'true' : undefined}
    data-shimmer-cycle={animated ? '650ms/1350ms' : undefined}
    className={cn('min-w-0 shrink', animated && 'agent-activity-shimmer', className)}
  >
    {children}
  </span>;
}

type ActivityDisclosureProps = {
  title: string;
  detail?: ReactNode;
  icon?: ReactNode;
  active?: boolean;
  failed?: boolean;
  open: boolean;
  onToggle: () => void;
  reducedMotion: boolean;
  label?: string;
  kind: 'reasoning' | 'tool';
  state?: string;
};

/**
 * The shared activity primitive used by reasoning and tools. It deliberately
 * mirrors the proven Lovable/Codex grammar: a quiet borderless row, a right
 * chevron, and detail attached by one vertical reading guide — never a card or
 * a second log line pretending to be a result.
 */
function ActivityDisclosure({ title, detail, icon, active = false, failed = false, open, onToggle, reducedMotion, label = title, kind, state }: ActivityDisclosureProps) {
  const hasDetail = Boolean(detail);
  return <div className="group/activity min-w-0" data-active={active ? 'true' : 'false'}>
    <button
      type="button"
      aria-expanded={hasDetail ? open : false}
      aria-label={label}
      data-activity-kind={kind}
      data-reason-state={state}
      onClick={hasDetail ? onToggle : undefined}
      className={cn(
        'inline-flex min-h-8 w-fit max-w-full items-center gap-1.5 rounded-md px-1 py-1 text-left text-[length:calc(13px*var(--font-scale))] outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring/40',
        hasDetail ? 'agent-activity-trigger cursor-pointer' : 'cursor-default',
      )}
    >
      {icon ? <span className={cn('agent-activity-icon grid size-4 shrink-0 place-items-center transition-colors duration-150', failed && 'text-destructive')}>{icon}</span> : null}
      <ActiveText
        active={active}
        reducedMotion={reducedMotion}
        className={cn(
          'min-w-0 max-w-[65ch] truncate transition-colors duration-150',
          active
            ? 'agent-text-primary font-medium'
            : failed
              ? 'text-destructive'
              : 'agent-text-interactive',
        )}
      >{title}</ActiveText>
      {hasDetail ? <ChevronRight
        aria-hidden="true"
        className={cn('agent-activity-icon size-3.5 shrink-0 transition-[color,transform] duration-200 motion-reduce:transition-none', open && 'rotate-90')}
      /> : null}
    </button>

    <AnimatePresence initial={false}>
      {hasDetail && open ? <motion.div
        role="region"
        aria-label={`${label} — chi tiết`}
        initial={reducedMotion ? false : { height: 0, opacity: 0 }}
        animate={{ height: 'auto', opacity: 1 }}
        exit={reducedMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
        transition={{ duration: reducedMotion ? 0 : 0.24, ease: [0.16, 1, 0.3, 1] }}
        className="overflow-hidden"
      >
        <div
          data-activity-connector="true"
          data-reasoning-preview={kind === 'reasoning' ? 'true' : undefined}
          className="agent-text-secondary ml-[7px] max-w-[68ch] border-l border-border/70 pb-2 pl-4 pt-1 text-[length:calc(12.5px*var(--font-scale))] leading-[1.6]"
        >{detail}</div>
      </motion.div> : null}
    </AnimatePresence>
  </div>;
}

const ANSWER_MOTION_STILL = false as const;
const ANSWER_MOTION_ENTER = { opacity: 0, y: 4 };
const ANSWER_MOTION_SETTLED = { opacity: 1, y: 0 };
const ANSWER_TRANSITION = { duration: 0.16, ease: [0.16, 1, 0.3, 1] as const };
const ANSWER_TRANSITION_NONE = { duration: 0 };

type AgentAnswerProps = {
  answerText: string;
  /** Pace the reveal. False flushes what has arrived in one paint. */
  running: boolean;
  showActions: boolean;
  reduceMotion: boolean;
  onRetry?: () => void;
  onRevealFrame?: () => void;
  capabilityReply: boolean;
  onOpenCapabilities?: () => void;
};

/**
 * The answer, and the reveal that drives it.
 *
 * `useStreamingText` lives HERE rather than in the parent on purpose. It sets
 * state once per animation frame, so hosting it in `AgentActivityStream` made
 * every frame re-render the whole column — the disclosure, the reasoning block
 * and every activity row with its nested `AnimatePresence`. Isolating it means a
 * reveal frame touches only this subtree.
 *
 * That is also what makes the no-fake-shimmer rule hold structurally rather
 * than by luck: the shimmer overlay now sits in a subtree that does not
 * re-render while text streams, so its CSS animation cannot restart.
 */
const AgentAnswer = memo(function AgentAnswer({ answerText, running, showActions, reduceMotion, onRetry, onRevealFrame, capabilityReply, onOpenCapabilities }: AgentAnswerProps) {
  const { shown, settled: revealSettled } = useStreamingText({
    target: answerText,
    // Only the live draft is paced. Durable text is a finished blob — on a
    // reconnect, or at the terminal boundary, it describes generation that has
    // already happened, and animating it would be simulating progress
    // Text landed at once. `running: false` makes the hook flush it in one paint.
    running,
    reducedMotion: reduceMotion,
  });
  const [copied, setCopied] = useState(false);
  // When the reveal is not pacing, the flush happens in an effect — one commit
  // later. Rendering the arrived text directly removes that empty first commit,
  // so the answer is present the moment the article exists. This is not pacing:
  // `running` is false precisely because there is nothing left to pace.
  const text = running ? shown : answerText;

  // Layout effect, so the pin happens in the same frame the text paints and the
  // reader never sees the bottom drift away.
  useLayoutEffect(() => { onRevealFrame?.(); }, [text, onRevealFrame]);

  return <motion.article
    aria-label="Agent response"
    initial={reduceMotion ? ANSWER_MOTION_STILL : ANSWER_MOTION_ENTER}
    animate={ANSWER_MOTION_SETTLED}
    transition={reduceMotion ? ANSWER_TRANSITION_NONE : ANSWER_TRANSITION}
    className="mt-3 max-w-[48rem]"
  >
    <AgentMarkdown caret={running}>{text}</AgentMarkdown>

    {capabilityReply && !running ? <div
      data-capability-reply="true"
      className="mt-3 flex flex-wrap items-center gap-2 text-[length:calc(12px*var(--font-scale))] text-muted-foreground"
    >
      <span>Xem đầy đủ các trạng thái trong danh mục năng lực.</span>
      {onOpenCapabilities ? <button
        type="button"
        aria-label="Mở danh mục năng lực"
        onClick={onOpenCapabilities}
        className="rounded-md border border-border px-2.5 py-1.5 font-medium text-foreground transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        Mở danh mục năng lực
      </button> : null}
    </div> : null}

    {showActions && (revealSettled || !running) ? <div className="mt-3 flex items-center gap-0.5">
      <button
        type="button"
        aria-label={copied ? 'Đã chép câu trả lời' : 'Chép câu trả lời'}
        onClick={() => {
          void navigator.clipboard?.writeText(answerText);
          setCopied(true);
          window.setTimeout(() => setCopied(false), COPY_CONFIRMATION_MS);
        }}
        className="inline-flex min-h-8 items-center gap-1.5 rounded-md px-2 text-[length:calc(12px*var(--font-scale))] text-muted-foreground outline-none transition-colors duration-150 hover:bg-surface hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        {copied ? <Check aria-hidden="true" className="size-3.5" /> : <Copy aria-hidden="true" className="size-3.5" />}
        {copied ? 'Đã chép' : 'Chép'}
      </button>
      {onRetry ? <button
        type="button"
        aria-label="Thử lại yêu cầu"
        onClick={onRetry}
        className="inline-flex min-h-8 items-center gap-1.5 rounded-md px-2 text-[length:calc(12px*var(--font-scale))] text-muted-foreground outline-none transition-colors duration-150 hover:bg-surface hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        <RotateCcw aria-hidden="true" className="size-3.5" />Thử lại
      </button> : null}
    </div> : null}
  </motion.article>;
});

export function AgentActivityStream({ events = [], draft = emptyEphemeralDraft, awaitingFirstEvent = false, stopRequested = false, startedAtMs = null, onSettled, onRetry, onRevealFrame, onOpenCapabilities, reducedMotion }: Props) {
  const systemReducedMotion = useReducedMotion();
  const reduceMotion = reducedMotion ?? Boolean(systemReducedMotion);
  const turnEvents = useMemo(() => currentTurnEvents(events), [events]);
  const view = useMemo(() => projectAgentActivity(turnEvents), [turnEvents]);
  const draftView = useMemo(() => projectEphemeralDraft(draft), [draft]);
  const canonicalTerminal = view.terminal !== 'running';
  // The durable full text *replaces* the draft, never appends to it (ADR-0008).
  const answerText = view.finalText || draftView.text;
  const responseStarted = answerText.length > 0;
  const draftStarted = responseStarted || draftView.reasoning.length > 0;
  const presentationSettled = canonicalTerminal || responseStarted;
  const answerRunning = !canonicalTerminal && !stopRequested && !view.finalText;
  const isFailed = view.terminal === 'failed';
  // A turn the operator stopped is terminal-failed on the wire, but it is not a
  // failure to them. The distinction rides in the payload rather than in a new
  // event type, so replay stays byte-stable.
  const cancelled = isFailed && turnEvents.at(-1)?.payload?.status === 'CANCELLED';
  const draftHeadline = draftView.reasoning.find((segment) => segment.stage === 'intake')?.title;
  const draftSummary = draftView.reasoning.find((segment) => segment.stage === 'analysis')?.title;
  const reasoning = {
    title: draftHeadline || view.reasoning?.title || 'Đang xử lý yêu cầu',
    body: draftSummary || view.reasoning?.body || '',
  };
  const hasReasoning = Boolean(draftHeadline || draftSummary || view.reasoning);
  const rows = view.rows;
  const activeOperation = rows.findLast((row) => row.state === 'active' && row.kind === 'tool');
  const activeWaiting = rows.findLast((row) => row.kind === 'waiting');
  const activityBusy = !presentationSettled && (Boolean(activeOperation) || Boolean(activeWaiting) || hasReasoning);
  const currentTurnKey = turnKey(turnEvents);
  const onSettledRef = useRef(onSettled);
  const settledNotifiedRef = useRef(false);
  const terminalElapsedRef = useRef<number | null>(null);
  const [open, setOpen] = useState(true);
  const [settled, setSettled] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(() => startedAtMs == null ? 0 : Math.max(0, Date.now() - startedAtMs));
  const [openReasonId, setOpenReasonId] = useState<string | null>(null);
  const [reasoningOpen, setReasoningOpen] = useState(true);

  // A turn in flight shows how long it has been working, so the elapsed value
  // has to advance. One second is the granularity the copy renders; anything
  // faster would repaint the column for no visible gain.
  useEffect(() => {
    if (presentationSettled || startedAtMs == null) return;
    const timer = window.setInterval(() => {
      setElapsedMs(Math.max(0, Date.now() - startedAtMs));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [presentationSettled, startedAtMs]);

  useEffect(() => { onSettledRef.current = onSettled; }, [onSettled]);

  useEffect(() => {
    settledNotifiedRef.current = false;
    terminalElapsedRef.current = null;
    setElapsedMs(startedAtMs == null ? 0 : Math.max(0, Date.now() - startedAtMs));
    setSettled(false);
    setOpen(true);
    setOpenReasonId(null);
    setReasoningOpen(true);
  }, [currentTurnKey, startedAtMs]);

  useEffect(() => {
    if (activeOperation?.detail) setOpenReasonId(activeOperation.id);
  }, [activeOperation?.id, activeOperation?.detail]);

  useEffect(() => {
    if (!presentationSettled || settled) return;
    if (terminalElapsedRef.current == null) {
      terminalElapsedRef.current = startedAtMs == null
        ? historicalDuration(turnEvents)
        : Math.max(0, Date.now() - startedAtMs);
      setElapsedMs(terminalElapsedRef.current ?? 0);
    }
    setOpen(false);
    setSettled(true);
  }, [presentationSettled, settled, startedAtMs, turnEvents]);

  useEffect(() => {
    if (!settled || settledNotifiedRef.current) return;
    settledNotifiedRef.current = true;
    onSettledRef.current?.(terminalElapsedRef.current ?? 0);
  }, [settled]);

  if (awaitingFirstEvent && !draftStarted) {
    return <div role="status" aria-busy="true" className="agent-text-meta flex min-h-9 w-full items-center text-[length:calc(12.5px*var(--font-scale))]">
      <ActiveText active reducedMotion={reduceMotion}>Đang bắt đầu…</ActiveText>
    </div>;
  }

  if (turnEvents.length === 0 && !draftStarted) return null;

  const hasDuration = startedAtMs != null || historicalDuration(turnEvents) != null;
  const summary = presentationSettled
    ? cancelled
      ? hasDuration ? `Đã dừng theo yêu cầu sau ${formatDuration(elapsedMs)}` : 'Đã dừng theo yêu cầu'
      : isFailed
        ? hasDuration ? `Đã dừng sau ${formatDuration(elapsedMs)}` : 'Đã dừng'
        : hasDuration ? `Đã xử lý trong ${formatDuration(elapsedMs)}` : 'Đã xử lý'
    : startedAtMs != null
      ? `Đang suy luận trong ${formatDuration(elapsedMs)}`
      : 'Đang suy luận';
  const disclosureOpen = presentationSettled && !settled ? false : open;

  const toggleReason = (row: ActivityViewRow) => {
    if (!row.detail) return;
    setOpenReasonId((current) => current === row.id ? null : row.id);
  };

  return <div data-agent-activity-stream="true" className="w-full">
    {presentationSettled ? <button
      type="button"
      aria-expanded={disclosureOpen}
      aria-label={summary}
      onClick={() => setOpen((value) => !value)}
      className="agent-activity-trigger agent-text-meta group/stream -ml-1 flex min-h-9 max-w-full items-center gap-2 rounded-md px-1 py-1 text-left text-[length:calc(13.5px*var(--font-scale))] outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-ring/40"
    >
      <span className="min-w-0 flex-1 truncate">{summary}</span>
      <ChevronDown aria-hidden="true" className={cn('size-3.5 shrink-0 transition-transform duration-[160ms] motion-reduce:transition-none', !disclosureOpen && '-rotate-90')} />
    </button> : <div
      // While the turn runs the region is force-open, so this is a heading, not
      // a control — there is nothing for it to toggle yet. It replaces a state
      // where the column showed elapsed time only after the turn had finished.
      role="status"
      className="flex min-h-9 items-center gap-2 px-1 text-[length:calc(13.5px*var(--font-scale))] text-muted-foreground"
    >
      {/* Deliberately not shimmering: exactly one live shimmer exists at a
          time and it belongs to the operation actually running, not to a
          clock. */}
      <span className="min-w-0 shrink truncate">{summary}</span>
    </div>}

    <AnimatePresence initial={false}>
      {(!presentationSettled || disclosureOpen) ? <motion.div
        role="region"
        aria-label="Nhật ký xử lý"
        aria-busy={activityBusy}
        initial={reduceMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: reduceMotion ? 0 : 0.16, ease: [0.16, 1, 0.3, 1] }}
        className="overflow-hidden"
      >
        <div className="space-y-1 py-1.5 pr-2" aria-live="polite">
          {hasReasoning ? <ActivityDisclosure
            title={reasoning.title}
            detail={reasoning.body || undefined}
            active={!presentationSettled && !activeOperation && !activeWaiting}
            open={reasoningOpen}
            onToggle={() => setReasoningOpen((value) => !value)}
            reducedMotion={reduceMotion}
            kind="reasoning"
          /> : null}
          {rows.map((row) => {
            const active = !presentationSettled && (
              (row.state === 'active' && row.kind !== 'waiting')
              || (row.kind === 'waiting' && row.id === activeWaiting?.id)
            );
            const reasonCanOpen = row.kind === 'tool' && Boolean(row.detail);
            const reasonOpen = reasonCanOpen && openReasonId === row.id;
            const content = <>
              {rowIcon(row)}
              <ActiveText
                active={active}
                reducedMotion={reduceMotion}
                className={cn(
                  row.kind === 'prose' ? 'max-w-[72ch] text-[length:calc(14px*var(--font-scale))] leading-[1.55]' : 'font-medium',
                  active && 'text-[length:calc(14px*var(--font-scale))] font-semibold',
                  active
                    ? 'agent-text-primary'
                    : row.kind === 'prose'
                      ? 'agent-text-primary'
                      : 'agent-text-secondary',
                )}
              >{row.title}</ActiveText>
              {reasonCanOpen ? <ChevronDown aria-hidden="true" className={cn('size-3 shrink-0 text-muted-foreground transition-transform duration-[160ms] motion-reduce:transition-none', !reasonOpen && '-rotate-90')} /> : null}
            </>;
            return <motion.div
              key={row.id}
              initial={reduceMotion ? false : { opacity: 0, y: 2 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.12, ease: [0.16, 1, 0.3, 1] }}
              className="min-w-0"
            >
              {row.kind === 'tool' ? <>
                <ActivityDisclosure
                  title={row.title}
                  detail={row.detail || undefined}
                  icon={rowIcon(row)}
                  active={active}
                  failed={row.state === 'failed'}
                  open={reasonOpen}
                  onToggle={() => toggleReason(row)}
                  reducedMotion={reduceMotion}
                  kind="tool"
                  state={row.state === 'active' ? 'running' : row.state === 'complete' ? 'completed' : 'failed'}
                />
                {row.adjustmentCount > 0 ? <div data-activity-kind="adjustment" className="flex min-h-7 items-center gap-2 pl-6 pr-1 text-[length:calc(11.5px*var(--font-scale))] text-muted-foreground">
                  <RotateCcw aria-hidden="true" className="size-3 shrink-0" />
                  <span>{row.adjustmentCount > 1 ? `Đã hiệu chỉnh cách hiểu ${row.adjustmentCount} lần` : 'Đã hiệu chỉnh cách hiểu'}</span>
                </div> : null}
              </> : <div data-activity-kind={row.kind} data-active={active ? 'true' : 'false'} className={cn('max-w-[72ch] px-1 text-[length:calc(12px*var(--font-scale))]', row.kind === 'waiting' ? 'min-h-8 py-1' : 'py-1.5 leading-relaxed')}>
                <div className="flex items-start gap-2">{content}</div>
                {row.kind === 'prose' && row.detail ? <div
                  data-reasoning-preview="true"
                  className="agent-text-secondary mt-1 max-w-[66ch] overflow-hidden text-[length:calc(12.5px*var(--font-scale))] leading-[1.55] [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:2]"
                >{row.detail}</div> : null}
              </div>}
            </motion.div>;
          })}
        </div>
      </motion.div> : null}
    </AnimatePresence>

    <AnimatePresence initial={false}>
      {presentationSettled ? <AgentAnswer
        answerText={answerText}
        running={answerRunning}
        showActions={canonicalTerminal}
        reduceMotion={reduceMotion}
        onRetry={onRetry}
        onRevealFrame={onRevealFrame}
        capabilityReply={view.replyKind === 'capability'}
        onOpenCapabilities={onOpenCapabilities}
      /> : null}
    </AnimatePresence>
  </div>;
}
