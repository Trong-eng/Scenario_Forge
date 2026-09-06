'use client';

import { CircleDot, GitCommitHorizontal, Pause, Play } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { pilotMetrics } from './landing-copy';
import styles from './landing.module.css';
import { useLandingReducedMotion } from './useLandingReducedMotion';

function requestVideoPlayback(video: HTMLVideoElement, onRejected: () => void) {
  const request = video.play();
  if (request) void request.catch(onRejected);
}

export function RunEvidencePassage() {
  const stageRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const reducedMotion = useLandingReducedMotion();
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const stage = stageRef.current;
    const video = videoRef.current;
    if (!stage || !video) return;

    let inView = false;
    const syncPlayback = () => {
      if (reducedMotion || !inView || document.hidden) {
        video.pause();
        return;
      }
      requestVideoPlayback(video, () => setPlaying(false));
    };
    const onVisibilityChange = () => syncPlayback();
    const observer = typeof IntersectionObserver === 'undefined'
      ? null
      : new IntersectionObserver(([entry]) => {
          inView = entry.isIntersecting;
          syncPlayback();
        }, { threshold: 0.35 });

    if (reducedMotion) {
      video.pause();
      video.currentTime = 0;
    } else {
      observer?.observe(stage);
    }
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      observer?.disconnect();
      document.removeEventListener('visibilitychange', onVisibilityChange);
      video.pause();
    };
  }, [reducedMotion]);

  const togglePlayback = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) requestVideoPlayback(video, () => setPlaying(false));
    else video.pause();
  };

  return (
    <section className={styles.evidence} id="evidence" aria-labelledby="evidence-title" data-testid="run-evidence-passage">
      <header className={styles.evidenceIntro}>
        <h2 id="evidence-title">Không chỉ là một video đẹp.</h2>
        <p>Một run có giá trị khi video, event timeline, telemetry, seed, manifest hash và lineage cùng chỉ về một nguồn.</p>
      </header>
      <div className={styles.evidenceStage} ref={stageRef}>
        <div className={styles.videoFrame} aria-label="Video mô phỏng CARLA — bản xem trước synthetic">
          <video
            aria-label="Xe tự hành chạy trong mô phỏng CARLA với perception boxes và LiDAR"
            autoPlay={!reducedMotion}
            className={styles.runVideo}
            data-motion={reducedMotion ? 'static' : 'viewport'}
            data-testid="run-evidence-video"
            loop
            muted
            onPause={() => setPlaying(false)}
            onPlay={() => setPlaying(true)}
            playsInline
            poster="/carla-pov.jpg"
            preload="metadata"
            ref={videoRef}
            src="/carla-sim.mp4"
          >
            Trình duyệt không hỗ trợ video mô phỏng CARLA.
          </video>
          <div className={styles.liveStreamBadge} aria-hidden="true">
            <span className={styles.livePulse} />
            <span>SYNTHETIC PREVIEW</span>
          </div>
          <span>RUN / 00:12.840</span>
          <button
            type="button"
            aria-label={playing ? 'Tạm dừng video mô phỏng CARLA' : 'Phát video mô phỏng CARLA'}
            aria-pressed={playing}
            onClick={togglePlayback}
          >
            {playing ? <Pause aria-hidden="true" size={18} /> : <Play aria-hidden="true" size={18} />}
          </button>
        </div>
        <div className={styles.runEvidence}>
          <div className={styles.timelineHead}><span>EVENT TIMELINE</span><span>12.8s</span></div>
          {[['00.0', 'spawn'], ['04.2', 'trigger armed'], ['07.6', 'interaction'], ['12.8', 'claim evaluated']].map(([time, event], index) => (
            <div className={styles.timelineRow} key={event}><span>{time}</span><CircleDot aria-hidden="true" size={14} /><strong>{event}</strong><i style={{ width: `${34 + index * 14}%` }} /></div>
          ))}
          <dl className={styles.lineagePanel}>
            <div><dt><GitCommitHorizontal aria-hidden="true" size={16} /> manifest</dt><dd>sha256:8f2c…71ad</dd></div>
            <div><dt>seed</dt><dd>2048</dd></div>
            <div><dt>scenario IR</dt><dd>definition:v4</dd></div>
            <div><dt>approval</dt><dd className={styles.approved}>exact hash</dd></div>
          </dl>
        </div>
        <p className={styles.syntheticLabel}>SYNTHETIC PREVIEW · CARLA run liên kết với timeline và manifest</p>
      </div>
      <div className={styles.metrics} aria-label="Các mục tiêu pilot">
        {pilotMetrics.map((metric) => (
          <div key={metric.label}><span>Mục tiêu pilot</span><strong>{metric.value}</strong><p>{metric.label}</p></div>
        ))}
      </div>
    </section>
  );
}
