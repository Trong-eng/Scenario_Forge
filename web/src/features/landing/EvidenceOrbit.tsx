'use client';

import { CircleDot } from 'lucide-react';
import { motion, useInView, useMotionValueEvent, useScroll, useSpring, useTransform } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import styles from './landing.module.css';
import { useLandingReducedMotion } from './useLandingReducedMotion';

const evidenceFacts = [
  { label: 'Map nào?', track: 'outer', delay: '0s' },
  { label: 'Trigger ở đâu?', track: 'inner', delay: '0s' },
  { label: 'Ai đổi tốc độ?', track: 'outer', delay: '-9.333s' },
  { label: 'Seed nào đã chạy?', track: 'inner', delay: '-11s' },
  { label: 'Build nào được duyệt?', track: 'outer', delay: '-18.667s' },
] as const;

export function EvidenceOrbit() {
  const rootRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useLandingReducedMotion();
  const [documentHidden, setDocumentHidden] = useState(false);
  const [orbitSpeed, setOrbitSpeed] = useState<'normal' | 'slow'>('normal');
  const inView = useInView(rootRef, { margin: '180px 0px' });
  const { scrollYProgress } = useScroll({ target: rootRef, offset: ['start end', 'end start'] });
  const progress = useSpring(scrollYProgress, { stiffness: 72, damping: 24, mass: 0.45 });
  const scale = useTransform(progress, [0, 0.48, 1], [1, 0.76, 0.88]);
  const opacity = useTransform(progress, [0, 0.12, 0.82, 1], [0.62, 1, 1, 0.72]);

  useEffect(() => {
    const syncVisibility = () => setDocumentHidden(document.hidden);
    syncVisibility();
    document.addEventListener('visibilitychange', syncVisibility);
    return () => document.removeEventListener('visibilitychange', syncVisibility);
  }, []);

  useMotionValueEvent(progress, 'change', (latest) => {
    const nextSpeed = latest >= 0.42 ? 'slow' : 'normal';
    setOrbitSpeed((current) => current === nextSpeed ? current : nextSpeed);
  });

  return (
    <div className={styles.ambiguityField} ref={rootRef} aria-label="Các câu hỏi cần được làm rõ">
      <motion.div
        className={styles.evidenceOrbit}
        data-paused={reduceMotion || !inView || documentHidden ? 'true' : 'false'}
        data-speed={orbitSpeed}
        data-testid="evidence-orbit"
        style={reduceMotion ? undefined : { opacity, scale }}
      >
        <span className={`${styles.orbitTrack} ${styles.orbitTrackOuter}`} aria-hidden="true" />
        <span className={`${styles.orbitTrack} ${styles.orbitTrackInner}`} aria-hidden="true" />
        {evidenceFacts.map((fact, index) => (
          <span
            className={`${styles.orbitFact} ${fact.track === 'outer' ? styles.orbitFactOuter : styles.orbitFactInner}`}
            data-index={index}
            data-orbit-track={fact.track}
            data-testid="orbit-fact"
            key={fact.label}
            style={{
              animationDelay: fact.delay,
              animationPlayState: reduceMotion || !inView || documentHidden ? 'paused' : 'running',
              offsetRotate: '0deg',
            }}
          >
            {fact.label}
          </span>
        ))}
      </motion.div>
      <div className={styles.ambiguityCenter} data-testid="orbit-core">
        <CircleDot aria-hidden="true" size={20} />
        <strong>Một claim chưa đủ để chạy.</strong>
      </div>
    </div>
  );
}
