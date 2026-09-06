'use client';

import { motion, type MotionValue, useScroll, useTransform } from 'motion/react';
import { ShieldCheck } from 'lucide-react';
import { useRef } from 'react';
import { trustSignals } from './landing-copy';
import styles from './landing.module.css';
import { useLandingReducedMotion } from './useLandingReducedMotion';

const statements = [
  { copy: 'AI đề xuất.', className: 'authorityAI' },
  { copy: 'Hệ thống kiểm định.', className: 'authoritySystem' },
  { copy: 'Con người quyết định.', className: 'authorityHuman' },
] as const;

function AuthorityLine({ copy, index, progress, reducedMotion }: { copy: string; index: number; progress: MotionValue<number>; reducedMotion: boolean }) {
  const center = [0.18, 0.5, 0.82][index];
  const movementRange = [Math.max(0, center - 0.24), center, Math.min(1, center + 0.24)];
  const opacityRange = [Math.max(0, center - 0.25), center, Math.min(1, center + 0.25)];
  const x = useTransform(progress, movementRange, [index % 2 === 0 ? -120 : 110, 0, index % 2 === 0 ? 90 : -100]);
  const scale = useTransform(progress, movementRange, [0.72, 1, 0.78]);
  const opacity = useTransform(progress, opacityRange, [0.34, 1, 0.38]);

  return <motion.span aria-hidden="true" className={styles[statements[index].className]} style={reducedMotion ? undefined : { x, scale, opacity }}>{copy}</motion.span>;
}

export function AuthorityPassage() {
  const root = useRef<HTMLElement>(null);
  const reducedMotion = useLandingReducedMotion();
  const { scrollYProgress } = useScroll({ target: root, offset: ['start start', 'end end'] });
  const fieldRotate = useTransform(scrollYProgress, [0, 1], [-8, 8]);
  const fieldScale = useTransform(scrollYProgress, [0, 0.5, 1], [0.8, 1.1, 0.86]);

  return (
    <section className={styles.authorityPassage} ref={root} aria-labelledby="trust-title" data-testid="authority-passage">
      <div className={styles.authoritySticky} data-testid="authority-sticky">
        <motion.div aria-hidden="true" className={styles.authorityField} style={reducedMotion ? undefined : { rotate: fieldRotate, scale: fieldScale }} />
        <h2 id="trust-title" aria-label="AI đề xuất. Hệ thống kiểm định. Con người quyết định." className={styles.authorityHeadline}>
          {statements.map((statement, index) => (
            <AuthorityLine copy={statement.copy} index={index} key={statement.copy} progress={scrollYProgress} reducedMotion={reducedMotion} />
          ))}
        </h2>
        <p className={styles.authorityThesis}>Automation tăng tốc công việc. Authority vẫn phải nhìn thấy được.</p>
        <div className={styles.authorityProofs}>
          {trustSignals.map((signal) => (
            <article key={signal.index}>
              <ShieldCheck aria-hidden="true" size={17} />
              <h3>{signal.title}</h3>
              <p>{signal.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
