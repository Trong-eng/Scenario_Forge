'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { ChevronUp, LogOut, Settings, User as UserIcon } from 'lucide-react';
import { useAuth } from '@/shared/auth/AuthContext';
import { cn } from '@/lib/utils';
import { useT } from '@/shared/i18n';

type Props = {
  /** Sidebar expanded; collapsed shows the avatar alone. */
  open: boolean;
  onOpenSettings: () => void;
};

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Account entry point for the workspace: identity, personal settings and sign
 *  out live here rather than in the product navigation, so the sidebar lists
 *  places to work and this lists things about you. */
export function AccountMenu({ open, onOpenSettings }: Props) {
  const t = useT();
  const { user, logout } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState<{ left: number; bottom: number } | null>(null);

  useEffect(() => {
    if (!expanded) return;
    const onPointerDown = (event: MouseEvent) => {
      // The panel is portalled out of this container, so a click inside it is
      // not a click outside the menu.
      const target = event.target as Node;
      if (containerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setExpanded(false);
    };
    const onEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setExpanded(false); };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onEscape);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onEscape);
    };
  }, [expanded]);

  // The sidebar clips its own overflow so the collapsed rail can animate width.
  // A 240px panel therefore cannot escape it by positioning alone, so it is
  // portalled to the body and anchored to the trigger's measured position.
  useLayoutEffect(() => {
    if (!expanded) return;
    const measure = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (rect) setAnchor({ left: rect.left, bottom: window.innerHeight - rect.top + 8 });
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [expanded]);

  const name = user?.name ?? t('account.signedOut');
  const email = user?.email ?? '';

  return (
    <div ref={containerRef} className="relative" data-testid="account-menu">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        aria-haspopup="menu"
        ref={triggerRef}
        aria-label={t('account.menuLabel', { name })}
        className={cn(
          // A quiet control still has to read as pressable: the resting state is
          // outlined, hover lifts it, and the open state stays visibly held down.
          'flex min-h-11 w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition-all duration-200',
          'hover:border-border hover:bg-surface active:scale-[0.99]',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
          expanded ? 'border-border bg-surface shadow-sm' : 'border-transparent',
          open ? 'justify-start' : 'justify-center',
        )}
      >
        {user?.avatar_url
          ? <img src={user.avatar_url} alt="" className="size-7 shrink-0 rounded-full object-cover" />
          : <div className="grid size-7 shrink-0 place-items-center rounded-full bg-surface-strong text-[length:calc(10px*var(--font-scale))] font-semibold">{initialsOf(name)}</div>}
        {open ? (
          <>
            <span className="min-w-0 flex-1 text-left">
              <span className="block truncate text-[length:calc(12.5px*var(--font-scale))] font-medium text-foreground/90">{name}</span>
              {email ? <span className="block truncate text-[length:calc(11px*var(--font-scale))] text-muted-foreground">{email}</span> : null}
            </span>
            <ChevronUp aria-hidden="true" className={cn('size-3.5 shrink-0 text-muted-foreground transition-transform duration-200', expanded ? 'rotate-0' : 'rotate-180')} />
          </>
        ) : null}
      </button>

      {createPortal(
        <AnimatePresence>
        {expanded ? (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.16 }}
            ref={panelRef}
            style={{ left: anchor?.left ?? 0, bottom: anchor?.bottom ?? 0 }}
            className="fixed z-[70] w-60 overflow-hidden rounded-xl border border-border bg-card shadow-lg"
          >
            <div className="border-b border-border/70 px-3 py-2.5">
              <div className="truncate text-[length:calc(12.5px*var(--font-scale))] font-semibold">{name}</div>
              {email ? <div className="truncate text-[length:calc(11.5px*var(--font-scale))] text-muted-foreground">{email}</div> : null}
              {user?.role ? <div className="mt-1 inline-flex rounded-md bg-surface px-1.5 py-0.5 text-[length:calc(10.5px*var(--font-scale))] uppercase tracking-[0.06em] text-muted-foreground">{user.role}</div> : null}
            </div>
            <button
              type="button"
              role="menuitem"
              onClick={() => { setExpanded(false); onOpenSettings(); }}
              className="flex min-h-11 w-full items-center gap-2 px-3 text-left text-[length:calc(12.5px*var(--font-scale))] transition-colors hover:bg-surface"
            >
              <Settings aria-hidden="true" className="size-3.5" />{t('account.settings')}
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => { setExpanded(false); void logout(); }}
              className="flex min-h-11 w-full items-center gap-2 border-t border-border/70 px-3 text-left text-[length:calc(12.5px*var(--font-scale))] text-destructive transition-colors hover:bg-surface"
            >
              <LogOut aria-hidden="true" className="size-3.5" />{t('account.signOut')}
            </button>
            {!user ? (
              <div className="flex items-center gap-2 border-t border-border/70 px-3 py-2 text-[length:calc(11.5px*var(--font-scale))] text-muted-foreground">
                <UserIcon aria-hidden="true" className="size-3.5" />{t('auth.sessionExpired')}
              </div>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>,
        document.body,
      )}
    </div>
  );
}
