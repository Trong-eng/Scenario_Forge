import Image from 'next/image';
import type { IntroState } from './landingIntro';
import styles from './landing.module.css';

export function WorkerCue({ state }: { state: IntroState }) {
  const waving = ['igniting', 'lit', 'portal', 'revealing', 'complete'].includes(state);
  return (
    <div className={styles.introWorker} data-wave={waving ? 'true' : 'false'} data-testid="intro-worker">
      <Image
        className={styles.workerPose}
        src="/landing/worker-intro-front-v1.png"
        alt="Công nhân Scenario Forge đang chỉ vào dây đèn"
        width={1024}
        height={1536}
        priority
        aria-hidden={waving}
        data-motion="static"
        data-active={waving ? 'false' : 'true'}
        data-testid="intro-worker-point"
      />
      <Image
        className={styles.workerPose}
        src="/landing/worker-intro-wave-v1.png"
        alt="Công nhân Scenario Forge đang mỉm cười và vẫy chào"
        width={1024}
        height={1536}
        priority
        aria-hidden={!waving}
        data-motion="static"
        data-active={waving ? 'true' : 'false'}
        data-testid="intro-worker-wave"
      />
      <p className={styles.introSpeech} data-testid="intro-speech">{waving ? 'Chào mừng bạn.' : 'Nhấn vào hạt sáng nhé.'}</p>
    </div>
  );
}
