'use client';

import { ArrowRight, LogIn } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { BrandMark } from '@/shared/components/BrandMark';
import styles from './landing.module.css';

const SCROLL_THRESHOLD = 20;

export function LandingHeader() {
  const [scrolled, setScrolled] = useState(false);
  const rafId = useRef<number>(0);

  useEffect(() => {
    const onScroll = () => {
      cancelAnimationFrame(rafId.current);
      rafId.current = requestAnimationFrame(() => {
        setScrolled(window.scrollY > SCROLL_THRESHOLD);
      });
    };

    // sync on mount
    setScrolled(window.scrollY > SCROLL_THRESHOLD);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(rafId.current);
      window.removeEventListener('scroll', onScroll);
    };
  }, []);

  return (
    <header className={styles.siteHeader} data-scrolled={String(scrolled)} data-testid="landing-header">
      <a className={styles.brand} href="#top" aria-label="Scenario Forge — về đầu trang">
        <BrandMark className={styles.brandMark} />
        <span>Scenario Forge</span>
      </a>
      <nav className={styles.nav} aria-label="Điều hướng chính">
        <a href="#workflow">Quy trình</a>
        <a href="#evidence">Bằng chứng</a>
        <a href="/login" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
          <LogIn size={15} /> Đăng nhập
        </a>
        <a className={styles.navCta} href="/workspace">
          Mở workspace <ArrowRight aria-hidden="true" size={16} />
        </a>
      </nav>
    </header>
  );
}
