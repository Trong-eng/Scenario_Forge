'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient, type ProviderRequestContext } from '@/shared/api/client';
import type { AgentThread } from '@/shared/api/agentTypes';
import type { LiveSession } from './liveTypes';

const PAGE_SIZE = 100;

function selectionStorageKey(projectId: string) {
  return `scenario-forge:agent-thread:${projectId}`;
}

function correlationId(operation: string) {
  const compact = operation.replace(/[^a-zA-Z0-9-]/g, '-').slice(0, 24);
  return `web-agent-${compact}-${crypto.randomUUID().replaceAll('-', '').slice(0, 16)}`.slice(0, 64);
}

function newestFirst(left: AgentThread, right: AgentThread) {
  const byUpdated = Date.parse(right.updated_at) - Date.parse(left.updated_at);
  return byUpdated || right.thread_id.localeCompare(left.thread_id);
}

function readSelection(projectId: string) {
  try { return window.localStorage.getItem(selectionStorageKey(projectId)); }
  catch { return null; }
}

function writeSelection(projectId: string, threadId: string | null) {
  try {
    if (threadId) window.localStorage.setItem(selectionStorageKey(projectId), threadId);
    else window.localStorage.removeItem(selectionStorageKey(projectId));
  } catch {
    // Storage is only a convenience hint and may be unavailable.
  }
}

function requestContext(session: LiveSession, operation: string): ProviderRequestContext {
  return { ...session, correlationId: correlationId(operation) };
}

/** Durable account-owned conversation index. localStorage can select a server row,
 * but it can never add a row to Recent. */
export function useAgentThreadIndex(session: LiveSession | null) {
  const [threads, setThreads] = useState<AgentThread[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generationRef = useRef(0);

  const refresh = useCallback(async () => {
    if (!session) return [];
    const generation = ++generationRef.current;
    setLoading(true);
    setError(null);
    try {
      const items: AgentThread[] = [];
      const seenCursors = new Set<string>();
      let cursor: string | undefined;
      do {
        const page = await apiClient.listAgentThreads(
          requestContext(session, 'thread-index'),
          PAGE_SIZE,
          cursor,
        );
        items.push(...page.items);
        if (page.next_cursor && seenCursors.has(page.next_cursor)) {
          throw new Error('Agent thread index returned a repeated cursor.');
        }
        if (page.next_cursor) seenCursors.add(page.next_cursor);
        cursor = page.next_cursor ?? undefined;
      } while (cursor);
      if (generation !== generationRef.current) return items;
      const durable = [...new Map(items.map((item) => [item.thread_id, item])).values()].sort(newestFirst);
      setThreads(durable);
      setSelectedThreadId((current) => {
        const hinted = current ?? readSelection(session.projectId);
        const selected = hinted && durable.some((item) => item.thread_id === hinted) ? hinted : null;
        writeSelection(session.projectId, selected);
        return selected;
      });
      return durable;
    } catch (reason) {
      if (generation === generationRef.current) {
        setError(reason instanceof Error ? reason.message : 'Không thể tải lịch sử cuộc trò chuyện.');
      }
      return [];
    } finally {
      if (generation === generationRef.current) setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    generationRef.current += 1;
    setThreads([]);
    setSelectedThreadId(null);
    setError(null);
    if (session) void refresh();
  }, [refresh, session]);

  const selectThread = useCallback((threadId: string) => {
    if (!session || !threads.some((item) => item.thread_id === threadId)) return false;
    setSelectedThreadId(threadId);
    writeSelection(session.projectId, threadId);
    return true;
  }, [session, threads]);

  const clearSelection = useCallback(() => {
    setSelectedThreadId(null);
    if (session) writeSelection(session.projectId, null);
  }, [session]);

  const upsertThread = useCallback((thread: AgentThread, select = true) => {
    setThreads((current) => [thread, ...current.filter((item) => item.thread_id !== thread.thread_id)].sort(newestFirst));
    if (select && session) {
      setSelectedThreadId(thread.thread_id);
      writeSelection(session.projectId, thread.thread_id);
    }
  }, [session]);

  /**
   * Replaces a thread where it already sits, without reordering.
   *
   * `upsertThread` moves a thread to the front and re-sorts by `updated_at`,
   * which is right when the agent has just done work in it. Renaming is not
   * work, so it replaces the server row without changing the current order.
   */
  const replaceThread = useCallback((thread: AgentThread) => {
    setThreads((current) => current.map((item) => item.thread_id === thread.thread_id ? thread : item));
  }, []);

  const renameThread = useCallback(async (threadId: string, title: string) => {
    if (!session) throw new Error('Project session is not connected.');
    const renamed = await apiClient.renameAgentThread(
      threadId,
      title,
      requestContext(session, 'rename-thread'),
    );
    replaceThread(renamed);
    return renamed;
  }, [replaceThread, session]);

  return {
    threads, selectedThreadId, loading, error, refresh, selectThread,
    clearSelection, upsertThread, renameThread,
  };
}
