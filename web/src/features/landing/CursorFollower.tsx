'use client';

import { motion, useMotionValue, useSpring } from 'motion/react';
import { useEffect, useState } from 'react';
import { useLandingReducedMotion } from './useLandingReducedMotion';
import styles from './landing.module.css';

export function CursorFollower() {
  const reducedMotion = useLandingReducedMotion();
  const [visible, setVisible] = useState(false);
  const [hovered, setHovered] = useState(false);
  const targetX = useMotionValue(0);
  const targetY = useMotionValue(0);
  const outerX = useSpring(targetX, { stiffness: 180, damping: 24, mass: 0.18 });
  const outerY = useSpring(targetY, { stiffness: 180, damping: 24, mass: 0.18 });
  const innerX = useSpring(targetX, { stiffness: 520, damping: 30, mass: 0.08 });
  const innerY = useSpring(targetY, { stiffness: 520, damping: 30, mass: 0.08 });

  useEffect(() => {
    const coarsePointer = typeof window.matchMedia === 'function'
      && window.matchMedia('(pointer: coarse)').matches;
    if (reducedMotion || coarsePointer) return;

    const onPointerMove = (event: PointerEvent) => {
      targetX.set(event.clientX);
      targetY.set(event.clientY);
      setVisible(true);
    };
    const onPointerLeave = () => setVisible(false);
    const onMouseOver = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      setHovered(Boolean(target?.closest('a, button, [role="button"], input, select, textarea')));
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerleave', onPointerLeave);
    document.addEventListener('mouseover', onMouseOver, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerleave', onPointerLeave);
      document.removeEventListener('mouseover', onMouseOver);
    };
  }, [reducedMotion, targetX, targetY]);

  return (
    <div
      aria-hidden="true"
      className={styles.cursorContainer}
      data-hovered={String(hovered)}
      data-testid="landing-cursor"
      data-visible={String(visible)}
    >
      <motion.div className={styles.cursorOuter} style={{ x: outerX, y: outerY }}>
        <span className={styles.cursorRing} data-testid="landing-cursor-ring" />
        <span className={styles.cursorAura} data-testid="landing-cursor-aura" />
        <span className={styles.cursorCrosshairH} data-testid="landing-cursor-crosshair-h" />
        <span className={styles.cursorCrosshairV} data-testid="landing-cursor-crosshair-v" />
      </motion.div>
      <motion.div
        animate={{ opacity: hovered ? 0.7 : 1, scale: hovered ? 0.6 : 1 }}
        className={styles.cursorInner}
        style={{ x: innerX, y: innerY }}
        transition={{ duration: reducedMotion ? 0 : 0.22, ease: [0.2, 0.8, 0.2, 1] }}
      />
    </div>
  );
}
