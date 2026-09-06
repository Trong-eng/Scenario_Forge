import type { Metadata } from 'next';
import { LandingPage } from '@/features/landing/LandingPage';
import { LANDING_INTRO_BOOTSTRAP } from '@/features/landing/landingIntro';

export const metadata: Metadata = {
  title: 'Scenario Forge — Từ tình huống đến bằng chứng mô phỏng',
  description: 'Biến mô tả giao thông thành kịch bản CARLA có cấu trúc, kiểm định, phê duyệt và bằng chứng truy vết được.',
};

const LANDING_INTRO_CRITICAL_CSS = `html[data-sf-intro='pending'] body{background:#060709}
html[data-sf-intro='pending'] [data-sf-intro-content]{visibility:hidden}
html[data-sf-intro='seen'] [data-sf-intro-shell]{display:none}`;

export default function Page() {
  return (
    <>
      <style id="sf-intro-critical" dangerouslySetInnerHTML={{ __html: LANDING_INTRO_CRITICAL_CSS }} />
      <script id="sf-intro-bootstrap" dangerouslySetInnerHTML={{ __html: LANDING_INTRO_BOOTSTRAP }} />
      <noscript>
        <style>{'[data-sf-intro-shell]{display:none!important}[data-sf-intro-content]{display:block!important}'}</style>
      </noscript>
      <LandingPage />
    </>
  );
}
