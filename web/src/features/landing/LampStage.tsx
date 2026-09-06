import type { CSSProperties, MouseEvent, PointerEvent, RefObject } from 'react';
import type { IntroState } from './landingIntro';
import styles from './landing.module.css';

type Props = {
  cordRef: RefObject<HTMLButtonElement>;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  onPointerDown: (event: PointerEvent<HTMLButtonElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLButtonElement>) => void;
  onPointerUp: (event: PointerEvent<HTMLButtonElement>) => void;
  pull: number;
  state: IntroState;
};

export function LampStage({ cordRef, onClick, onPointerDown, onPointerMove, onPointerUp, pull, state }: Props) {
  const active = !['armed', 'pulling'].includes(state);
  return (
    <div className={styles.lampScene} data-lamp-lit={active ? 'true' : 'false'} data-testid="lamp-stage">
      <div className={styles.lampBloom} aria-hidden="true" />
      <div className={styles.lampFlare} aria-hidden="true" />
      <svg className={styles.lampSvg} viewBox="0 0 360 560" role="img" aria-label={active ? 'Đèn bàn đã bật' : 'Đèn bàn đang tắt'}>
        <defs>
          <linearGradient id="sf-lamp-metal" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#55524c" />
            <stop offset="0.42" stopColor="#242526" />
            <stop offset="0.74" stopColor="#101214" />
            <stop offset="1" stopColor="#45423c" />
          </linearGradient>
          <linearGradient id="sf-lamp-rim" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#302f2c" />
            <stop offset="1" stopColor="#0e1012" />
          </linearGradient>
          <radialGradient id="sf-bulb" cx="50%" cy="35%" r="70%">
            <stop offset="0" stopColor="#fff8cd" />
            <stop offset="0.42" stopColor="#ffd86f" />
            <stop offset="1" stopColor="#a86925" />
          </radialGradient>
          <filter id="sf-lamp-shadow" x="-30%" y="-30%" width="160%" height="180%">
            <feDropShadow dx="0" dy="18" stdDeviation="16" floodColor="#000" floodOpacity=".52" />
          </filter>
        </defs>
        <path className={styles.lampCone} d="M82 170 C58 266 34 374 8 520 H352 C326 374 302 266 278 170 Z" />
        <g filter="url(#sf-lamp-shadow)">
          <path className={styles.lampShadeOuter} fill="url(#sf-lamp-metal)" d="M62 145 C70 69 118 30 180 30 C242 30 290 69 298 145 C272 170 88 170 62 145 Z" />
          <path className={styles.lampShadeHighlight} d="M83 130 C97 79 132 52 180 50 C228 52 263 79 277 130" />
          <path className={styles.lampShadeRim} fill="url(#sf-lamp-rim)" d="M62 145 C94 162 266 162 298 145 L286 176 C253 195 107 195 74 176 Z" />
          <ellipse className={styles.lampUnderside} cx="180" cy="166" rx="104" ry="24" />
          <path className={styles.bulbHousing} d="M157 161 H203 L196 202 Q180 216 164 202 Z" />
          <ellipse className={styles.lampBulb} fill="url(#sf-bulb)" cx="180" cy="205" rx="24" ry="17" />
          <path className={styles.lampStem} d="M171 191 H189 V472 H171 Z" />
          <path className={styles.lampStemGlint} d="M176 202 V462" />
          <path className={styles.lampBase} d="M91 472 C95 452 265 452 269 472 L292 504 C272 526 88 526 68 504 Z" />
          <path className={styles.lampBaseGlint} d="M92 480 C132 469 228 469 268 480" />
        </g>
      </svg>
      <button
        className={styles.lampCord}
        ref={cordRef}
        style={{
          '--cord-pull': `${pull}px`,
          '--cord-stretch': String(1 + pull / 112),
        } as CSSProperties}
        type="button"
        aria-label="Bật Scenario Forge bằng dây"
        onClick={onClick}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <span className={styles.cordThread} />
        <span className={styles.cordBead} />
      </button>
      <p className={styles.introPrompt}>Kéo nhẹ sợi dây</p>
    </div>
  );
}
