'use client';

import { useEffect, useState, type CSSProperties } from 'react';
import styles from './landing.module.css';

const FIREFLIES = [
  { x: 10, y: 34, dx: 38, dy: -18, delay: -1.2, duration: 8.4 },
  { x: 20, y: 72, dx: 24, dy: -30, delay: -4.8, duration: 10.2 },
  { x: 33, y: 18, dx: 46, dy: 18, delay: -3.1, duration: 11.6 },
  { x: 43, y: 82, dx: 35, dy: -42, delay: -6.4, duration: 12.8 },
  { x: 55, y: 29, dx: 31, dy: 25, delay: -8.2, duration: 9.8 },
  { x: 63, y: 68, dx: 25, dy: -23, delay: -2.6, duration: 10.8 },
  { x: 71, y: 14, dx: 18, dy: 31, delay: -5.2, duration: 12.2 },
  { x: 78, y: 78, dx: 14, dy: -44, delay: -9.1, duration: 13.4 },
  { x: 86, y: 38, dx: -24, dy: 16, delay: -3.8, duration: 11.1 },
  { x: 94, y: 62, dx: -31, dy: -18, delay: -7.4, duration: 12.6 },
] as const;

type FireflyStyle = CSSProperties & {
  '--firefly-x': string;
  '--firefly-y': string;
  '--firefly-dx': string;
  '--firefly-dy': string;
  '--firefly-delay': string;
  '--firefly-duration': string;
};

export function FireflyField({ reducedMotion }: { reducedMotion: boolean }) {
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const update = () => setPaused(document.hidden);
    update();
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);

  return (
    <div
      className={styles.fireflyField}
      data-testid="firefly-field"
      data-motion={reducedMotion ? 'static' : 'ambient'}
      data-paused={paused ? 'true' : 'false'}
      aria-hidden="true"
    >
      {FIREFLIES.map((fly, index) => {
        const style: FireflyStyle = {
          '--firefly-x': `${fly.x}%`,
          '--firefly-y': `${fly.y}%`,
          '--firefly-dx': `${fly.dx}vw`,
          '--firefly-dy': `${fly.dy}vh`,
          '--firefly-delay': `${fly.delay}s`,
          '--firefly-duration': `${fly.duration}s`,
        };
        return (
          <span className={styles.firefly} data-testid="firefly" style={style} key={`${fly.x}-${fly.y}`}>
            <i className={styles.fireflyHalo} data-firefly-halo />
            <i className={styles.fireflyCore} data-firefly-core />
            <i className={styles.fireflyWing} />
          </span>
        );
      })}
    </div>
  );
}
