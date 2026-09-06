'use client';

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { cn, getRovingTabIndex } from '@/lib/utils';
import { resolveSplitLayout } from './workspaceCanvasModel';

type CompactSurface = 'chat' | 'canvas';

type Props = {
  chat: ReactNode;
  canvas: ReactNode;
  canvasOpen: boolean;
  chatFraction: number;
  onChatFractionChange: (fraction: number) => void;
  compactSurface?: CompactSurface;
  onCompactSurfaceChange?: (surface: CompactSurface) => void;
  onLayoutModeChange?: (compact: boolean) => void;
  /** Deterministic width for component tests; production measures its container. */
  measuredWidth?: number;
};

export function WorkspaceSplitLayout({ chat, canvas, canvasOpen, chatFraction, onChatFractionChange, compactSurface = 'chat', onCompactSurfaceChange, onLayoutModeChange, measuredWidth }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const [observedWidth, setObservedWidth] = useState(measuredWidth ?? 0);
  const width = measuredWidth ?? observedWidth;
  const layout = resolveSplitLayout(width || 1440, chatFraction);

  useEffect(() => {
    if (measuredWidth !== undefined) return;
    const container = containerRef.current;
    if (!container) return;
    const update = () => setObservedWidth(container.getBoundingClientRect().width);
    update();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(container);
    window.addEventListener('resize', update);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [measuredWidth]);

  useEffect(() => {
    if (!width || layout.compact || Math.abs(layout.chatFraction - chatFraction) < 0.0005) return;
    onChatFractionChange(layout.chatFraction);
  }, [chatFraction, layout.chatFraction, layout.compact, onChatFractionChange, width]);

  useEffect(() => {
    onLayoutModeChange?.(layout.compact);
  }, [layout.compact, onLayoutModeChange]);

  if (layout.compact) {
    if (!canvasOpen) {
      return <div ref={containerRef} className="h-full min-h-0 min-w-0 overflow-hidden">
        <div className="h-full min-h-0 min-w-0 overflow-hidden">{chat}</div>
      </div>;
    }

    return <div ref={containerRef} className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      <div role="tablist" aria-label="Workspace surfaces" className="mx-3 mt-3 flex shrink-0 rounded-xl border border-border bg-surface p-1">
        {(['chat', 'canvas'] as const).map((surface, index) => <button
          type="button"
          role="tab"
          id={`workspace-tab-${surface}`}
          aria-selected={compactSurface === surface}
          aria-controls={`workspace-panel-${surface}`}
          tabIndex={compactSurface === surface ? 0 : -1}
          key={surface}
          onClick={() => onCompactSurfaceChange?.(surface)}
          onKeyDown={(event) => {
            const nextIndex = getRovingTabIndex(event.key, index, 2);
            if (nextIndex === null) return;
            event.preventDefault();
            const next = (['chat', 'canvas'] as const)[nextIndex]!;
            onCompactSurfaceChange?.(next);
            document.getElementById(`workspace-tab-${next}`)?.focus();
          }}
          className={cn('min-h-11 flex-1 rounded-lg px-3 text-[length:calc(12.5px*var(--font-scale))] font-semibold', compactSurface === surface ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground')}
        >{surface === 'chat' ? 'Chat' : 'Canvas'}</button>)}
      </div>
      <div id="workspace-panel-chat" role="tabpanel" aria-labelledby="workspace-tab-chat" hidden={compactSurface !== 'chat'} className="min-h-0 min-w-0 flex-1 overflow-hidden">{chat}</div>
      <div data-testid="workspace-canvas-pane" id="workspace-panel-canvas" role="tabpanel" aria-labelledby="workspace-tab-canvas" hidden={compactSurface !== 'canvas'} className="min-h-0 min-w-0 flex-1 overflow-hidden">{canvas}</div>
    </div>;
  }

  const updateFromPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current || !containerRef.current) return;
    const bounds = containerRef.current.getBoundingClientRect();
    const next = resolveSplitLayout(bounds.width, (event.clientX - bounds.left) / bounds.width);
    onChatFractionChange(next.chatFraction);
  };

  const changePixels = (pixels: number) => {
    if (!width) return;
    onChatFractionChange(resolveSplitLayout(width, pixels / width).chatFraction);
  };

  const desktopWidth = width || 1440;
  const splitFraction = Math.min(
    layout.maximumChat / desktopWidth,
    Math.max(layout.minimumChat / desktopWidth, chatFraction),
  );

  return <div
    ref={containerRef}
    data-canvas-open={canvasOpen ? 'true' : 'false'}
    className="grid h-full min-h-0 min-w-0 overflow-hidden transition-[grid-template-columns] duration-[280ms] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:duration-0"
    style={{ gridTemplateColumns: canvasOpen
      ? `${splitFraction * 100}% 9px minmax(0px, 1fr)`
      : '100% 0px minmax(0px, 1fr)' }}
  >
    <div className="h-full min-h-0 min-w-0 overflow-hidden">{chat}</div>
    {canvasOpen ? <div
      role="separator"
      aria-label="Thay đổi kích thước Chat và Canvas"
      aria-orientation="vertical"
      aria-valuemin={layout.minimumChat}
      aria-valuemax={layout.maximumChat}
      aria-valuenow={layout.chatPixels}
      tabIndex={0}
      onPointerDown={(event) => {
        draggingRef.current = true;
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={updateFromPointer}
      onPointerUp={(event) => {
        draggingRef.current = false;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onPointerCancel={() => { draggingRef.current = false; }}
      onKeyDown={(event) => {
        const increment = event.shiftKey ? 80 : 40;
        if (event.key === 'ArrowLeft') changePixels(layout.chatPixels - increment);
        else if (event.key === 'ArrowRight') changePixels(layout.chatPixels + increment);
        else if (event.key === 'Home') changePixels(320);
        else if (event.key === 'End') changePixels(layout.maximumChat);
        else return;
        event.preventDefault();
      }}
      className="group relative z-10 cursor-col-resize touch-none outline-none focus-visible:bg-primary/10"
    >
      <span aria-hidden="true" className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border transition-colors group-hover:bg-primary/50 group-focus-visible:bg-primary" />
      <span aria-hidden="true" className="absolute left-1/2 top-1/2 h-10 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-border transition-colors group-hover:bg-primary/50 group-focus-visible:bg-primary" />
    </div> : <div aria-hidden="true" />}
    <div
      data-testid="workspace-canvas-pane"
      data-motion-state={canvasOpen ? 'open' : 'closed'}
      aria-hidden={!canvasOpen}
      // React 18 still treats `inert` as an unknown attribute, so emit its
      // standards-based presence form until the React 19 boolean prop lands.
      inert={canvasOpen ? undefined : ('true' as unknown as boolean)}
      className={cn(
        'h-full min-h-0 min-w-[640px] overflow-hidden transition-[transform,opacity] duration-[280ms] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transform-none motion-reduce:duration-0',
        canvasOpen ? 'transform-none opacity-100' : 'pointer-events-none translate-x-6 opacity-0',
      )}
    >{canvas}</div>
  </div>;
}
