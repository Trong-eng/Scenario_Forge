'use client';

import { ArrowRight } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type MouseEvent, type PointerEvent, type ReactNode } from 'react';
import { BrandMark } from '@/shared/components/BrandMark';
import { FireflyField } from './FireflyField';
import { IntroPortal } from './IntroPortal';
import { LampStage } from './LampStage';
import { WorkerCue } from './WorkerCue';
import { useLandingReducedMotion } from './useLandingReducedMotion';
import {
  clampCordPull,
  getIntroSequence,
  markLandingIntroSeen,
  shouldActivateCord,
  type IntroState,
} from './landingIntro';
import styles from './landing.module.css';

type Props = { children: ReactNode };

function focusLandingHero() {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => document.getElementById('hero-title')?.focus({ preventScroll: true }));
  });
}

export function LandingIntroGate({ children }: Props) {
  const reducedMotion = useLandingReducedMotion();
  // The server and first client render deliberately agree: the intro exists.
  // The parser-blocking bootstrap controls visibility before this component hydrates.
  const [visible, setVisible] = useState(true);
  const [state, setState] = useState<IntroState>('armed');
  const [pull, setPull] = useState(0);
  const pointerRef = useRef<{ id: number; startY: number; dragged: boolean } | null>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const cordRef = useRef<HTMLButtonElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const completedRef = useRef(false);
  const focusAfterRevealRef = useRef(false);
  // The hero keeps focus for everyone, but only a keyboard exit deserves a focus ring.
  const exitModeRef = useRef<'keyboard' | 'pointer'>('pointer');

  const finish = useCallback((focus = true) => {
    completedRef.current = true;
    focusAfterRevealRef.current = focus;
    setState('complete');
    setVisible(false);
    document.documentElement.dataset.sfIntro = 'seen';
  }, []);

  const skip = useCallback((mode: 'keyboard' | 'pointer' = 'keyboard') => {
    exitModeRef.current = mode;
    let storage: Storage | null = null;
    try { storage = window.sessionStorage; } catch { /* fail open */ }
    markLandingIntroSeen(storage);
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    finish();
  }, [finish]);

  useEffect(() => {
    const alreadySeen = document.documentElement.dataset.sfIntro === 'seen';
    if (alreadySeen) {
      completedRef.current = true;
      setState('complete');
      setVisible(false);
      return;
    }
    const timers = timersRef.current;
    return () => timers.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    contentRef.current?.toggleAttribute('inert', visible);
    document.body.dataset.landingIntro = visible ? 'active' : 'complete';
    if (!visible) {
      if (focusAfterRevealRef.current) {
        focusAfterRevealRef.current = false;
        focusLandingHero();
      }
      return;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
      delete document.body.dataset.landingIntro;
    };
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    cordRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') skip('keyboard');
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [skip, visible]);

  const activate = useCallback((mode: 'keyboard' | 'pointer' = 'pointer') => {
    if (completedRef.current || !['armed', 'pulling'].includes(state)) return;
    exitModeRef.current = mode;
    completedRef.current = true;
    setPull(0);
    let storage: Storage | null = null;
    try { storage = window.sessionStorage; } catch { /* fail open */ }
    markLandingIntroSeen(storage);

    const sequence = getIntroSequence(reducedMotion);
    for (const step of sequence) {
      if (step.at === 0) {
        if (step.state === 'complete') finish();
        else setState(step.state);
        continue;
      }
      timersRef.current.push(setTimeout(() => {
        if (step.state === 'complete') finish();
        else setState(step.state);
      }, step.at));
    }
  }, [finish, reducedMotion, state]);

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (!['armed', 'pulling'].includes(state)) return;
    pointerRef.current = { id: event.pointerId, startY: event.clientY, dragged: false };
    event.currentTarget.setPointerCapture(event.pointerId);
    setState('pulling');
  };

  const onPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const pointer = pointerRef.current;
    if (!pointer || pointer.id !== event.pointerId) return;
    const distance = clampCordPull(event.clientY - pointer.startY);
    pointer.dragged = distance > 3;
    setPull(distance);
  };

  const onPointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    const pointer = pointerRef.current;
    if (!pointer || pointer.id !== event.pointerId) return;
    const activated = shouldActivateCord(clampCordPull(event.clientY - pointer.startY));
    const dragged = pointer.dragged;
    pointerRef.current = null;
    setPull(0);
    if (activated) activate('pointer');
    else setState('armed');
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (dragged) event.preventDefault();
  };

  const onCordClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (pointerRef.current?.dragged || !['armed', 'pulling'].includes(state)) return;
    // A keyboard-triggered click reports no pointer detail.
    activate(event.detail === 0 ? 'keyboard' : 'pointer');
  };

  return (
    <>
      {visible ? (
        <div
          className={styles.landingIntro}
          data-intro-state={state}
          data-testid="landing-intro"
          data-sf-intro-shell
          role="dialog"
          aria-modal="true"
          aria-labelledby="landing-intro-title"
        >
          <FireflyField reducedMotion={reducedMotion} />
          <div className={styles.introAmbient} aria-hidden="true" />
          <div className={styles.introStage}>
            <header className={styles.introHeader} data-testid="intro-identity">
              <a className={styles.introBrand} href="#top" aria-label="Scenario Forge — về đầu trang">
                <BrandMark className={styles.introBrandMark} />
                <span id="landing-intro-title">Scenario Forge</span>
              </a>
              <a className={styles.introWorkspaceCta} href="/workspace">
                Vào workspace <ArrowRight aria-hidden="true" size={16} />
              </a>
            </header>

            <LampStage
              cordRef={cordRef}
              onClick={onCordClick}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              pull={pull}
              state={state}
            />
            <WorkerCue state={state} />
            <IntroPortal state={state} />
          </div>
          <div className={styles.introLightWash} aria-hidden="true" />
          <button className={styles.introSkip} type="button" onClick={(event) => skip(event.detail === 0 ? 'keyboard' : 'pointer')}>Bỏ qua intro</button>
        </div>
      ) : null}
      <div
        ref={contentRef}
        className={styles.introContent}
        data-intro-exit={visible ? undefined : exitModeRef.current}
        data-sf-intro-content
      >
        {children}
      </div>
    </>
  );
}
