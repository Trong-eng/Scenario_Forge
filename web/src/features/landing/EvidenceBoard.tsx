'use client';

import Image from 'next/image';
import { motion } from 'motion/react';
import { Check, GitCommitHorizontal, Play } from 'lucide-react';
import styles from './EvidenceBoard.module.css';
import { useLandingReducedMotion } from './useLandingReducedMotion';

export type EvidenceState = 'description' | 'scenario-ir' | 'approval' | 'run-evidence';

type EvidenceBoardProps = {
  state: EvidenceState;
};

const ease = [0.16, 1, 0.3, 1] as const;

export function EvidenceBoard({ state }: EvidenceBoardProps) {
  const reducedMotion = useLandingReducedMotion();
  const transition = reducedMotion ? { duration: 0 } : { duration: 0.58, ease };
  const descriptionActive = state === 'description';
  const workbenchActive = state === 'scenario-ir';
  const approvalActive = state === 'approval';
  const runActive = state === 'run-evidence';
  const workbenchVisible = state !== 'description';

  return (
    <div
      aria-label="Evidence board chuyển từ tình huống gốc đến bằng chứng chạy"
      className={styles.board}
      data-evidence-state={state}
      data-reduced-motion={String(reducedMotion)}
      data-testid="evidence-board"
      role="img"
    >
      <motion.div
        aria-hidden={!descriptionActive}
        animate={{
          clipPath: descriptionActive ? 'inset(0% 0% 0% 0%)' : 'inset(6% 8% 8% 8%)',
          filter: descriptionActive ? 'saturate(1) brightness(1)' : 'saturate(.55) brightness(1.08)',
          opacity: descriptionActive ? 1 : 0,
          rotate: descriptionActive ? 0 : -2,
          scale: descriptionActive ? 1 : 0.92,
          x: descriptionActive ? '0%' : '-10%',
        }}
        className={`${styles.scene} ${styles.intakeScene}`}
        data-active={String(descriptionActive)}
        data-testid="evidence-scene-description"
        initial={false}
        transition={transition}
      >
        <Image
          alt="Tình huống Edufun được đưa vào Scenario Forge"
          fill
          sizes="(max-width: 767px) 92vw, (max-width: 1100px) 58vw, 49vw"
          src="/landing/scenario-forge-edufun-thumbnail-v2.png"
        />
        <div className={styles.intakeLabel}>
          <span>INTAKE / TÌNH HUỐNG GỐC</span>
          <strong>Motorcycle crossing in rain</strong>
        </div>
      </motion.div>

      <motion.div
        aria-hidden={!workbenchActive}
        animate={{
          clipPath: workbenchVisible ? 'inset(0% 0% 0% 0%)' : 'inset(0% 0% 0% 100%)',
          filter: workbenchActive ? 'saturate(1) brightness(1)' : 'saturate(.78) brightness(.98)',
          opacity: workbenchVisible ? 1 : 0,
          scale: workbenchActive ? 1 : 0.985,
          x: workbenchVisible ? '0%' : '7%',
        }}
        className={`${styles.scene} ${styles.workbenchScene}`}
        data-active={String(workbenchActive)}
        data-testid="evidence-scene-scenario-ir"
        initial={false}
        transition={transition}
      >
        <Image
          alt="Scenario Forge Workbench có cấu trúc với Scenario IR và inspector"
          fill
          sizes="(max-width: 767px) 92vw, (max-width: 1100px) 58vw, 49vw"
          src="/landing/workbench-preview.png"
        />
        <motion.div
          animate={{ opacity: workbenchActive ? 1 : 0, x: workbenchActive ? 0 : 22 }}
          className={styles.irCallout}
          initial={false}
          transition={{ ...transition, delay: reducedMotion ? 0 : 0.16 }}
        >
          <GitCommitHorizontal aria-hidden="true" size={16} />
          <span><b>STRUCTURED IR</b> Town05 · Rain · Seed 2048</span>
        </motion.div>
      </motion.div>

      <motion.div
        aria-hidden={!approvalActive}
        animate={{ opacity: approvalActive ? 1 : runActive ? 0.38 : 0 }}
        className={`${styles.scene} ${styles.approvalScene}`}
        data-active={String(approvalActive)}
        data-testid="evidence-scene-approval"
        initial={false}
        transition={transition}
      >
        <div className={styles.manifestSheet}>
          <span>BUILD MANIFEST</span>
          <dl>
            <div><dt>Scenario</dt><dd>intersection-rain-v7</dd></div>
            <div><dt>Policy</dt><dd>9 / 9 checks</dd></div>
            <div><dt>Reviewer</dt><dd>human-required</dd></div>
          </dl>
          <code>sha256:8f2c…71ad</code>
        </div>
        <motion.div
          animate={{ opacity: approvalActive ? 1 : 0, rotate: approvalActive ? -7 : -18, scale: approvalActive ? 1 : 1.38 }}
          className={styles.approvalStamp}
          initial={false}
          transition={{ duration: reducedMotion ? 0 : 0.34, delay: reducedMotion ? 0 : 0.18, ease }}
        >
          <Check aria-hidden="true" size={22} strokeWidth={2.4} />
          <strong>APPROVED</strong>
          <span>HASH BOUND</span>
        </motion.div>
      </motion.div>

      <motion.div
        aria-hidden={!runActive}
        animate={{ clipPath: runActive ? 'inset(0% 0% 0% 0%)' : 'inset(74% 0% 0% 0%)', opacity: runActive ? 1 : 0, y: runActive ? 0 : 30 }}
        className={`${styles.scene} ${styles.runScene}`}
        data-active={String(runActive)}
        data-testid="evidence-scene-run-evidence"
        initial={false}
        transition={transition}
      >
        <div className={styles.runHeader}>
          <span><Play aria-hidden="true" fill="currentColor" size={13} /> RUN PROOF</span>
          <code>MANIFEST / 8F2C71AD</code>
        </div>
        <div className={styles.runTrace} aria-hidden="true">
          <i /><i /><i /><i />
        </div>
        <div className={styles.runMetrics}>
          <span><strong>12.8s</strong> duration</span>
          <span><strong>9 rule checks</strong> passed</span>
          <span><strong>Exact seed</strong> replayable</span>
        </div>
      </motion.div>
    </div>
  );
}
