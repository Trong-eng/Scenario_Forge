import Image from 'next/image';
import { BrandMark } from '@/shared/components/BrandMark';
import type { IntroState } from './landingIntro';
import styles from './landing.module.css';

export function IntroPortal({ state }: { state: IntroState }) {
  const visible = ['portal', 'revealing', 'complete'].includes(state);
  return (
    <div className={styles.introPortal} data-testid="intro-portal" aria-hidden={visible ? undefined : 'true'}>
      <div className={styles.portalBrand}>
        <BrandMark className={styles.portalMark} />
        <span>Scenario Forge</span>
      </div>
      <div className={styles.portalArtifact}>
        <Image
          src="/landing/scenario-forge-edufun-thumbnail-v2.png"
          alt=""
          aria-hidden="true"
          width={1920}
          height={1080}
          sizes="(max-width: 767px) 82vw, 32vw"
          priority
        />
      </div>
      <p>Từ tình huống đến bằng chứng mô phỏng.</p>
    </div>
  );
}
