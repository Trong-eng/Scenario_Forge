import { ArrowDownRight, ArrowRight, CircleDot } from 'lucide-react';
import { AuthorityPassage } from './AuthorityPassage';
import { CinematicJourney } from './CinematicJourney';
import { CursorFollower } from './CursorFollower';
import { EvidenceOrbit } from './EvidenceOrbit';
import { HeroThumbnail } from './HeroThumbnail';
import { LandingHeader } from './LandingHeader';
import { LandingIntroGate } from './LandingIntroGate';
import { RunEvidencePassage } from './RunEvidencePassage';
import styles from './landing.module.css';

const workspaceHref = '/workspace';

export function LandingPage() {
  return (
    <LandingIntroGate>
      <main className={styles.landingShell}>
        <CursorFollower />
        <LandingHeader />

        <section className={styles.hero} id="top" aria-labelledby="hero-title">
        <div className={styles.heroCopy}>
          <h1 id="hero-title" tabIndex={-1}><span>Một tình huống.</span> <span>Một đường bằng chứng.</span></h1>
          <p className={styles.heroLead}>Scenario Forge biến mô tả giao thông thành một workflow có cấu trúc, kiểm định và phê duyệt — trước khi CARLA nhận lệnh chạy.</p>
          <div className={styles.heroActions}>
            <a className={styles.primaryCta} href={workspaceHref}>Mở Scenario Forge <ArrowRight aria-hidden="true" size={18} /></a>
            <a className={styles.textCta} href="#workflow">Xem quy trình <ArrowDownRight aria-hidden="true" size={18} /></a>
          </div>
        </div>
        <HeroThumbnail />
        <a className={styles.scrollCue} href="#situation" aria-label="Cuộn đến vấn đề"><span />Cuộn để theo dấu bằng chứng</a>
        </section>

        <section className={styles.situation} id="situation" aria-labelledby="problem-title">
        <div className={styles.situationLead}>
          <h2 id="problem-title">Mô tả tự nhiên luôn bắt đầu bằng vùng mờ.</h2>
          <p>Ý tưởng không phải phần khó. Phần khó là giữ map, actor, trigger, seed, mỗi lần chỉnh sửa và mỗi lần phê duyệt trên cùng một đường truy vết.</p>
        </div>
        <EvidenceOrbit />
        </section>

        <section className={styles.workflow} id="workflow" aria-labelledby="workflow-title">
          <CinematicJourney />
        </section>

        <AuthorityPassage />
        <RunEvidencePassage />

        <section className={styles.closing} aria-labelledby="closing-title">
        <h2 id="closing-title">Đưa tình huống tiếp theo<br />vào đường thử.</h2>
        <p>Giữ nguyên ý định. Làm rõ mọi giả định. Chỉ chạy điều đã được duyệt.</p>
        <a className={styles.primaryCta} href={workspaceHref}>Mở Scenario Forge <ArrowRight aria-hidden="true" size={18} /></a>
        <div className={styles.closingLine} aria-hidden="true"><span /><CircleDot size={18} /><span /></div>
        </section>

        <footer className={styles.footer}><span>Scenario Forge</span><span>Evidence before execution</span><span>Demo system / 2026</span></footer>
      </main>
    </LandingIntroGate>
  );
}
