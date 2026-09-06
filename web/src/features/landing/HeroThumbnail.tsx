'use client';

import Image from 'next/image';
import styles from './landing.module.css';

export function HeroThumbnail() {
  return (
    <div
      className={styles.heroThumbnail}
      data-motion="static"
      data-testid="hero-thumbnail"
    >
      <div className={styles.thumbnailFrame}>
        <Image
          alt="Scenario Forge Edufun: kỹ sư, bản đồ giao lộ và đường bằng chứng từ Scenic đến CARLA."
          height={1080}
          priority
          sizes="(max-width: 767px) 100vw, (max-width: 1100px) 84vw, 54vw"
          src="/landing/scenario-forge-edufun-thumbnail-v2.png"
          width={1920}
        />
        <span className={styles.thumbnailLabel}>SYNTHETIC PRODUCT ART · 2026</span>
      </div>
    </div>
  );
}
