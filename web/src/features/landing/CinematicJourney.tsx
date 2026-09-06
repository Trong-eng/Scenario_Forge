'use client';

import { motion, type MotionValue, useMotionValueEvent, useScroll, useSpring, useTransform } from 'motion/react';
import { useRef, useState } from 'react';
import { Check, Fingerprint, Play, ScanSearch } from 'lucide-react';
import { EvidenceBoard, type EvidenceState } from './EvidenceBoard';
import { useLandingReducedMotion } from './useLandingReducedMotion';
import styles from './landing.module.css';

const evidenceStates = [
  { id: 'description', label: 'Mô tả', icon: ScanSearch },
  { id: 'scenario-ir', label: 'Scenario IR', icon: Fingerprint },
  { id: 'approval', label: 'Hash-bound approval', icon: Check },
  { id: 'run-evidence', label: 'Run evidence', icon: Play },
] as const;

const chapters = [
  {
    signal: 'Ngôn ngữ tự nhiên',
    title: 'Bắt đầu bằng điều người kiểm thử thực sự nhìn thấy.',
    body: '“Xe máy cắt ngang giao lộ trong mưa” được giữ như một claim của con người — không bị hòa tan thành prompt tạm thời.',
    detail: 'Motorcycle crossing · Rain · Intersection',
  },
  {
    signal: 'Scenario IR',
    title: 'Biến vùng mờ thành cấu trúc có thể kiểm tra.',
    body: 'Map, actor, trigger, seed và nguồn gốc từng giá trị hiện ra trong cùng một định nghĩa. Giá trị giả định luôn được đánh dấu.',
    detail: 'Town05 · Trigger 18m · Seed 2048',
  },
  {
    signal: 'Human gate',
    title: 'Phê duyệt đúng build, không phê duyệt một ý niệm.',
    body: 'Reviewer nhìn thấy diff, provenance và manifest hash. Một thay đổi semantic làm approval cũ mất hiệu lực.',
    detail: 'sha256:8f2c…71ad · Reviewer required',
  },
  {
    signal: 'Run proof',
    title: 'Kết quả quay về cùng một đường lineage.',
    body: 'Video, timeline, telemetry, seed và manifest cùng trỏ về artifact đã được duyệt — đủ để replay và đối chiếu.',
    detail: '12.8s · 9 rule checks · Exact seed',
  },
] as const;

function KineticChapter({
  chapter,
  index,
  progress,
  reducedMotion,
}: {
  chapter: (typeof chapters)[number];
  index: number;
  progress: MotionValue<number>;
  reducedMotion: boolean;
}) {
  const center = index / (chapters.length - 1);
  const x = useTransform(progress, [Math.max(0, center - 0.28), center, Math.min(1, center + 0.28)], [-34, 0, 42]);
  const opacity = useTransform(progress, [Math.max(0, center - 0.3), center, Math.min(1, center + 0.3)], [0.34, 1, 0.28]);
  const clipPath = useTransform(progress, [Math.max(0, center - 0.22), center], ['inset(0 0 0 18%)', 'inset(0 0 0 0%)']);

  return (
    <article className={styles.journeyChapter} data-chapter={evidenceStates[index].id}>
      <span>{chapter.signal}</span>
      <motion.h3
        data-testid="kinetic-headline"
        style={reducedMotion ? undefined : { x, opacity, clipPath }}
      >
        {chapter.title}
      </motion.h3>
      <p>{chapter.body}</p>
      <code>{chapter.detail}</code>
    </article>
  );
}

export function CinematicJourney() {
  const root = useRef<HTMLDivElement>(null);
  const reducedMotion = useLandingReducedMotion();
  const [activeState, setActiveState] = useState<EvidenceState>('description');
  const { scrollYProgress } = useScroll({ target: root, offset: ['start start', 'end end'] });
  const easedProgress = useSpring(scrollYProgress, { stiffness: 90, damping: 26, mass: 0.32 });
  const x = useTransform(easedProgress, [0, 0.34, 0.7, 1], ['8%', '0%', '-3%', '-8%']);
  const y = useTransform(easedProgress, [0, 0.45, 1], ['7%', '0%', '-5%']);
  const scale = useTransform(easedProgress, [0, 0.38, 0.72, 1], [0.86, 1.02, 0.98, 0.91]);
  const rotateX = useTransform(easedProgress, [0, 0.5, 1], [7, 0, -3]);
  const rotateY = useTransform(easedProgress, [0, 0.48, 1], [-8, 0, 7]);
  const threadScale = useTransform(easedProgress, [0, 1], [0.08, 1]);

  useMotionValueEvent(scrollYProgress, 'change', (value) => {
    const index = Math.min(evidenceStates.length - 1, Math.floor(value * evidenceStates.length));
    setActiveState(evidenceStates[index].id);
  });

  return (
    <div ref={root} className={styles.journey} data-testid="cinematic-journey">
      <header className={styles.journeyOpening}>
        <h2 id="workflow-title">Một đường bằng chứng. Sáu checkpoint.</h2>
        <p>Không có cú nhảy ma thuật từ prompt sang video. Mỗi checkpoint làm rõ thêm điều hệ thống biết, điều nó giả định và điều con người đã duyệt.</p>
      </header>
      <div className={styles.journeyBody}>
        <div className={styles.journeyNarrative}>
          {chapters.map((chapter, index) => (
            <KineticChapter
              chapter={chapter}
              index={index}
              key={chapter.signal}
              progress={easedProgress}
              reducedMotion={reducedMotion}
            />
          ))}
        </div>

        <div className={styles.railColumn}>
          <div
            aria-label="Tiến độ bằng chứng"
            aria-valuemax={evidenceStates.length}
            aria-valuemin={1}
            aria-valuenow={evidenceStates.findIndex((state) => state.id === activeState) + 1}
            className={styles.verticalRail}
            data-orientation="vertical"
            data-evidence-state={activeState}
            data-testid="vertical-evidence-rail"
            role="progressbar"
          >
            <div className={styles.verticalRailTrack} aria-hidden="true">
              <motion.span
                data-testid="vertical-evidence-fill"
                style={reducedMotion ? { scaleY: 1 } : { scaleY: threadScale }}
              />
            </div>
            {evidenceStates.map(({ id, label, icon: Icon }) => (
              <div
                className={activeState === id ? styles.verticalRailStateActive : styles.verticalRailState}
                data-testid="vertical-evidence-node"
                key={id}
              >
                <Icon aria-hidden="true" size={15} />
                <span>{label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className={styles.artifactColumn} aria-label="Minh họa tiến trình từ định nghĩa đến bằng chứng chạy">
          <div className={styles.artifactSticky}>
            <div className={styles.artifactHalo} aria-hidden="true" />
            <motion.div
              className={styles.artifact}
              data-testid="cinematic-artifact"
              data-reduced-motion={String(reducedMotion)}
              style={reducedMotion ? { transform: 'none' } : { x, y, scale, rotateX, rotateY }}
            >
              <span className={styles.artifactGhost} aria-hidden="true" />
              <span className={styles.artifactGhostSecond} aria-hidden="true" />
              <div className={styles.artifactWindow}>
                <div className={styles.artifactChrome}>
                  <span><i /><i /><i /></span>
                  <strong>Scenario Forge / Workbench</strong>
                  <em>WORKBENCH_PREVIEW</em>
                </div>
                <EvidenceBoard state={activeState} />
              </div>
            </motion.div>

            <span className={styles.evidenceThreadAlias} data-testid="evidence-thread" data-evidence-state={activeState} aria-hidden="true" />
          </div>
        </div>
      </div>
    </div>
  );
}
