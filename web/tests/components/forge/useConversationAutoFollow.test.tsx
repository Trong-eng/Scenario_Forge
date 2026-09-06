import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useConversationAutoFollow } from '../../../src/components/forge/useConversationAutoFollow';

function Harness({ version }: { version: number }) {
  const follow = useConversationAutoFollow<HTMLDivElement>(version);
  return <>
    <div ref={follow.viewportRef} onScroll={follow.onScroll} data-testid="viewport">
      Content {version}
    </div>
    {follow.detached ? <button type="button" onClick={follow.jumpToLatest}>Xuống nội dung mới</button> : null}
    <button type="button" onClick={follow.followNow}>reveal-tick</button>
  </>;
}

function dimensions(element: HTMLElement, values: { scrollHeight: number; clientHeight: number; scrollTop: number }) {
  Object.defineProperties(element, {
    scrollHeight: { configurable: true, value: values.scrollHeight },
    clientHeight: { configurable: true, value: values.clientHeight },
    scrollTop: { configurable: true, writable: true, value: values.scrollTop },
  });
}

describe('useConversationAutoFollow', () => {
  it('follows new output only while the reader remains near the bottom', () => {
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
    const view = render(<Harness version={1} />);
    const viewport = screen.getByTestId('viewport');
    const scrollTo = vi.fn();
    Object.defineProperty(viewport, 'scrollTo', { configurable: true, value: scrollTo });
    dimensions(viewport, { scrollHeight: 1000, clientHeight: 400, scrollTop: 530 });
    fireEvent.scroll(viewport);

    view.rerender(<Harness version={2} />);
    act(() => frames.splice(0).forEach((frame) => frame(16)));
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 1000, behavior: 'smooth' });

    dimensions(viewport, { scrollHeight: 1200, clientHeight: 400, scrollTop: 500 });
    fireEvent.scroll(viewport);
    expect(screen.getByRole('button', { name: 'Xuống nội dung mới' })).toBeDefined();
    const callsBeforeDetachedUpdate = scrollTo.mock.calls.length;

    view.rerender(<Harness version={3} />);
    act(() => frames.splice(0).forEach((frame) => frame(32)));
    expect(scrollTo).toHaveBeenCalledTimes(callsBeforeDetachedUpdate);
  });

  it('jumps to the latest content and resumes following', () => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(16);
      return 1;
    });
    render(<Harness version={1} />);
    const viewport = screen.getByTestId('viewport');
    const scrollTo = vi.fn();
    Object.defineProperty(viewport, 'scrollTo', { configurable: true, value: scrollTo });
    dimensions(viewport, { scrollHeight: 1200, clientHeight: 400, scrollTop: 300 });
    fireEvent.scroll(viewport);

    fireEvent.click(screen.getByRole('button', { name: 'Xuống nội dung mới' }));
    expect(scrollTo).toHaveBeenLastCalledWith({ top: 1200, behavior: 'smooth' });
    expect(screen.queryByRole('button', { name: 'Xuống nội dung mới' })).toBeNull();
  });

  it('pins to the bottom on a reveal tick, and stops once detached', () => {
    // Ephemeral token frames never advance the cursor, so the layout effect that
    // follows durable events cannot follow a growing answer. `followNow` is the
    // reveal's own tick — and it must obey the same detach rule.
    render(<Harness version={1} />);
    const viewport = screen.getByTestId('viewport');
    dimensions(viewport, { scrollHeight: 1000, clientHeight: 400, scrollTop: 560 });
    fireEvent.scroll(viewport);

    fireEvent.click(screen.getByRole('button', { name: 'reveal-tick' }));
    expect(viewport.scrollTop).toBe(1000);

    // Scroll well away from the bottom: following stops, and a reveal tick must
    // not drag the reader back down.
    viewport.scrollTop = 100;
    fireEvent.scroll(viewport);
    fireEvent.click(screen.getByRole('button', { name: 'reveal-tick' }));
    expect(viewport.scrollTop).toBe(100);
  });
});
