'use client';

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';

const focusableSelector = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]';

export function getFocusableElements(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(focusableSelector)).filter((element) => {
    if (element.tabIndex < 0 || element.getAttribute('aria-disabled') === 'true') return false;
    if (element.closest('[hidden], [inert], [aria-hidden="true"]')) return false;
    const styles = window.getComputedStyle(element);
    return styles.display !== 'none' && styles.visibility !== 'hidden';
  });
}

export function trapModalFocus(event: KeyboardEvent<HTMLElement>) {
  if (event.key !== 'Tab') return;
  const focusable = getFocusableElements(event.currentTarget);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

type ModalOverlayProps = {
  name: string;
  backdropTestId: string;
  dialogRef: RefObject<HTMLElement>;
  onClose: () => void;
  restoreFocusRef?: RefObject<HTMLElement | null>;
  children: (onKeyDown: (event: KeyboardEvent<HTMLElement>) => void) => ReactNode;
};

export function ModalOverlay({ name, backdropTestId, dialogRef, onClose, restoreFocusRef, children }: ModalOverlayProps) {
  const [mounted, setMounted] = useState(false);
  const layerRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!mounted) return;
    const layer = layerRef.current;
    if (!layer) return;
    const restoreTarget = restoreFocusRef?.current;

    const background = document.querySelector<HTMLElement>('[data-testid="forge-background"]');
    const isolated = [...new Set([
      ...Array.from(document.body.children),
      ...(background ? [background] : []),
    ])]
      .filter((element): element is HTMLElement => element instanceof HTMLElement && element !== layer && !['SCRIPT', 'STYLE'].includes(element.tagName))
      .map((element) => ({ element, ariaHidden: element.getAttribute('aria-hidden'), inert: element.inert, inertAttribute: element.hasAttribute('inert') }));
    for (const { element } of isolated) {
      element.setAttribute('aria-hidden', 'true');
      element.setAttribute('inert', '');
      element.inert = true;
    }

    let frame = 0;
    const focusWhenVisible = () => {
      const dialog = dialogRef.current;
      if (!dialog?.isConnected) return;
      const [first] = getFocusableElements(dialog);
      if (!first) {
        frame = window.requestAnimationFrame(focusWhenVisible);
        return;
      }
      first.focus();
    };
    frame = window.requestAnimationFrame(focusWhenVisible);

    const onEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onEscape);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('keydown', onEscape);
      for (const { element, ariaHidden, inert, inertAttribute } of isolated) {
        if (ariaHidden === null) element.removeAttribute('aria-hidden');
        else element.setAttribute('aria-hidden', ariaHidden);
        if (!inertAttribute) element.removeAttribute('inert');
        element.inert = inert;
      }
      if (restoreTarget?.isConnected) window.requestAnimationFrame(() => restoreTarget.focus());
    };
  }, [dialogRef, mounted, name, onClose, restoreFocusRef]);

  if (!mounted) return null;
  return createPortal(
    <div ref={layerRef} data-modal-layer={name} className="pointer-events-none fixed inset-0 z-40 overflow-hidden">
      <div aria-hidden="true" data-testid={backdropTestId} onClick={onClose} className="pointer-events-auto fixed inset-0 z-40 bg-foreground/20 backdrop-blur-[2px]" />
      {children(trapModalFocus)}
    </div>,
    document.body,
  );
}
