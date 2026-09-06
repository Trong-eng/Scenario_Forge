'use client';

import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { apiClient, type ProviderRequestContext } from '../../shared/api/client';
import { emptyEphemeralDraft, initialAgentThreadState, reduceAgentThread, reduceEphemeralDraft, type AgentEphemeralFrame, type AgentEvent, type AgentPendingInterrupt, type AgentThread, type AgentThreadState } from '../../shared/api/agentTypes';

type Action = { type: 'thread'; thread: AgentThread } | { type: 'event'; event: AgentEvent } | { type: 'events'; events: readonly AgentEvent[] } | { type: 'ephemeral'; frames: readonly AgentEphemeralFrame[] } | { type: 'pending'; pending: AgentPendingInterrupt | null } | { type: 'clearDraft' } | { type: 'reset' };

export const AGENT_EVENT_RECONCILE_INTERVAL_MS = 1000;

function reducer(state: AgentThreadState, action: Action): AgentThreadState {
  if (action.type === 'thread') return { ...state, thread: action.thread };
  if (action.type === 'event') return reduceAgentThread(state, action.event);
  if (action.type === 'events') return action.events.reduce(reduceAgentThread, state);
  if (action.type === 'ephemeral') {
    const ephemeral = action.frames.reduce(reduceEphemeralDraft, state.ephemeral);
    return ephemeral === state.ephemeral ? state : { ...state, ephemeral };
  }
  if (action.type === 'clearDraft') return state.ephemeral === emptyEphemeralDraft ? state : { ...state, ephemeral: emptyEphemeralDraft };
  if (action.type === 'pending') return { ...state, pendingInterrupt: action.pending };
  return initialAgentThreadState;
}

/** Browser-owned view state only; every decision is submitted to the API. */
export function useAgentThread() {
  const [state, dispatch] = useReducer(reducer, initialAgentThreadState);
  const [streamError, setStreamError] = useState<unknown>(null);
  const [connected, setConnected] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const reconcileTimerRef = useRef<number | null>(null);
  const reconcileInFlightRef = useRef(false);
  const cursorRef = useRef(0);
  const eventBufferRef = useRef<AgentEvent[]>([]);
  const ephemeralBufferRef = useRef<AgentEphemeralFrame[]>([]);
  const eventFrameRef = useRef<number | null>(null);
  const setThread = useCallback((thread: AgentThread) => dispatch({ type: 'thread', thread }), []);
  const applyEvent = useCallback((event: AgentEvent) => dispatch({ type: 'event', event }), []);
  const flushEvents = useCallback(() => {
    if (eventFrameRef.current != null) {
      window.cancelAnimationFrame(eventFrameRef.current);
      eventFrameRef.current = null;
    }
    // Ephemeral frames flush first: a token that arrived before a durable
    // event must not be folded in after it, or the draft would briefly win
    // over text that has already been committed.
    if (ephemeralBufferRef.current.length) {
      const frames = ephemeralBufferRef.current;
      ephemeralBufferRef.current = [];
      dispatch({ type: 'ephemeral', frames });
    }
    if (!eventBufferRef.current.length) return;
    const events = eventBufferRef.current;
    eventBufferRef.current = [];
    dispatch({ type: 'events', events });
  }, []);
  const queueEvent = useCallback((event: AgentEvent) => {
    cursorRef.current = Math.max(cursorRef.current, event.cursor);
    eventBufferRef.current.push(event);
    if (event.event_type === 'completed' || event.event_type === 'failed' || event.event_type === 'interrupt_required') {
      flushEvents();
      return;
    }
    if (eventFrameRef.current != null) return;
    eventFrameRef.current = window.requestAnimationFrame(() => {
      eventFrameRef.current = null;
      flushEvents();
    });
  }, [flushEvents]);
  const queueEphemeral = useCallback((frame: AgentEphemeralFrame) => {
    ephemeralBufferRef.current.push(frame);
    if (eventFrameRef.current != null) return;
    eventFrameRef.current = window.requestAnimationFrame(() => {
      eventFrameRef.current = null;
      flushEvents();
    });
  }, [flushEvents]);
  const clearDraft = useCallback(() => {
    ephemeralBufferRef.current = [];
    dispatch({ type: 'clearDraft' });
  }, []);
  const setPendingInterrupt = useCallback((pending: AgentPendingInterrupt | null) => dispatch({ type: 'pending', pending }), []);
  const reset = useCallback(() => dispatch({ type: 'reset' }), []);
  const refreshPending = useCallback((threadId: string, context: ProviderRequestContext) => (
    apiClient.getPendingAgentInterrupt(threadId, context).then((pending) => {
      setPendingInterrupt(pending);
      return pending;
    })
  ), [setPendingInterrupt]);
  const disconnect = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    if (reconcileTimerRef.current != null) {
      window.clearInterval(reconcileTimerRef.current);
      reconcileTimerRef.current = null;
    }
    reconcileInFlightRef.current = false;
    // Drop undelivered draft tokens rather than flushing them: without a live
    // connection nothing will ever supersede them with durable text.
    ephemeralBufferRef.current = [];
    flushEvents();
    setConnected(false);
  }, [flushEvents]);
  const connect = useCallback((threadId: string, context: ProviderRequestContext, afterCursor = state.cursor) => {
    disconnect();
    cursorRef.current = Math.max(0, afterCursor);
    const controller = new AbortController();
    abortRef.current = controller;
    setStreamError(null);
    setConnected(true);
    const handleEvent = async (event: AgentEvent) => {
      setStreamError(null);
      queueEvent(event);
      if (event.event_type === 'interrupt_required') {
        const pending = await apiClient.getPendingAgentInterrupt(threadId, context);
        if (abortRef.current === controller) setPendingInterrupt(pending);
      }
      if (event.event_type === 'completed' || event.event_type === 'failed') {
        if (reconcileTimerRef.current != null) {
          window.clearInterval(reconcileTimerRef.current);
          reconcileTimerRef.current = null;
        }
      }
    };
    void apiClient.getPendingAgentInterrupt(threadId, context).then((pending) => {
      if (abortRef.current === controller) setPendingInterrupt(pending);
    }).catch(setStreamError);
    void apiClient.streamAgentEvents(threadId, context, {
      onEvent: handleEvent,
      onEphemeral: (frame) => {
        if (abortRef.current !== controller) return;
        setStreamError(null);
        queueEphemeral(frame);
      },
      onReconnect: () => setStreamError(null),
      onError: setStreamError,
    }, { signal: controller.signal, afterCursor, live: true }).catch(setStreamError).finally(() => {
      flushEvents();
      if (abortRef.current === controller) {
        setConnected(false);
      }
    });
    const reconcile = () => {
      if (abortRef.current !== controller || reconcileInFlightRef.current) return;
      reconcileInFlightRef.current = true;
      void apiClient.streamAgentEvents(threadId, context, { onEvent: handleEvent }, {
        signal: controller.signal,
        afterCursor: cursorRef.current,
        live: false,
        singleSnapshot: true,
        maxRetries: 0,
      }).catch(() => {
        // The live stream remains authoritative for errors; reconciliation is
        // a best-effort convergence path for proxies that buffer SSE frames.
      }).finally(() => {
        reconcileInFlightRef.current = false;
      });
    };
    reconcileTimerRef.current = window.setInterval(reconcile, AGENT_EVENT_RECONCILE_INTERVAL_MS);
  }, [disconnect, flushEvents, queueEphemeral, queueEvent, setPendingInterrupt, state.cursor]);
  useEffect(() => disconnect, [disconnect]);
  return { state, setThread, applyEvent, setPendingInterrupt, refreshPending, reset, connect, disconnect, clearDraft, connected, streamError };
}
