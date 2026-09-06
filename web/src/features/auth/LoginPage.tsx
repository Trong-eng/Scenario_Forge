'use client';

import { AlertCircle, ArrowLeft, Check, CheckCircle2, Eye, EyeOff, Info, Lock, Mail } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/shared/auth/AuthContext';
import { BrandMark } from '@/shared/components/BrandMark';
import styles from './login.module.css';

/* --------------------------------------------------------
   Subtle & Refined CARLA LiDAR Radar Wave Overlay
   Gentle ambient cyan scan ripples and radar sweeping beam
   -------------------------------------------------------- */
function LidarRadarOverlay() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let sweepAngle = -Math.PI / 3;
    let sweepDir = 1;
    let waveR = 0;

    const resize = () => {
      canvas.width = canvas.offsetWidth * window.devicePixelRatio;
      canvas.height = canvas.offsetHeight * window.devicePixelRatio;
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    };
    resize();
    window.addEventListener('resize', resize);

    const draw = () => {
      const w = canvas.offsetWidth;
      const h = canvas.offsetHeight;
      ctx.clearRect(0, 0, w, h);

      // Sensor origin: on the rooftop of the ego car (around 52% x, 56% y)
      const ox = w * 0.52;
      const oy = h * 0.56;

      // 1. Expanding LiDAR pulse wave (soft & subtle)
      waveR = (waveR + 0.55) % (w * 0.46);
      ctx.beginPath();
      ctx.ellipse(ox, oy, waveR, waveR * 0.38, 0, 0, Math.PI * 2);
      const alpha = Math.max(0, 1 - waveR / (w * 0.46)) * 0.5;
      ctx.strokeStyle = `rgba(34, 211, 238, ${alpha})`;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 6]);
      ctx.stroke();

      // Trailing ring
      const waveR2 = (waveR + w * 0.22) % (w * 0.46);
      ctx.beginPath();
      ctx.ellipse(ox, oy, waveR2, waveR2 * 0.38, 0, 0, Math.PI * 2);
      const alpha2 = Math.max(0, 1 - waveR2 / (w * 0.46)) * 0.35;
      ctx.strokeStyle = `rgba(14, 165, 233, ${alpha2})`;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.setLineDash([]);

      // 2. Sweeping Radar Laser Arc
      sweepAngle += 0.012 * sweepDir;
      if (sweepAngle > -Math.PI * 0.25) sweepDir = -1;
      if (sweepAngle < -Math.PI * 0.75) sweepDir = 1;

      const beamLen = w * 0.36;
      const bx = ox + Math.cos(sweepAngle) * beamLen;
      const by = oy + Math.sin(sweepAngle) * (beamLen * 0.4);

      const beamGrad = ctx.createLinearGradient(ox, oy, bx, by);
      beamGrad.addColorStop(0, 'rgba(34, 211, 238, 0.4)');
      beamGrad.addColorStop(1, 'rgba(34, 211, 238, 0)');

      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.lineTo(bx, by);
      ctx.strokeStyle = beamGrad;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Sensor origin dot
      ctx.beginPath();
      ctx.arc(ox, oy, 3.5, 0, Math.PI * 2);
      ctx.fillStyle = '#22d3ee';
      ctx.shadowColor = '#22d3ee';
      ctx.shadowBlur = 8;
      ctx.fill();
      ctx.shadowBlur = 0;

      animId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return <canvas ref={canvasRef} className={styles.lidarRadarCanvas} aria-hidden="true" />;
}

/* --------------------------------------------------------
   Framed Gallery Canvas: Live CARLA Simulation Artwork
   -------------------------------------------------------- */
function CarlaHero() {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      // Giảm tốc độ video xuống 0.7x (70% tốc độ gốc) để trông nguy hiểm/điềm tĩnh hơn
      videoRef.current.playbackRate = 0.7;
    }
  }, []);

  const [telemetry, setTelemetry] = useState({
    speed: 24.0,
    time: '19:34',
    fps: 30.0,
    sensors: 82,
  });

  // Ticker for live simulation telemetry numbers
  useEffect(() => {
    const timer = setInterval(() => {
      setTelemetry({
        speed: Number((24.0 + Math.sin(Date.now() / 900) * 0.5).toFixed(1)),
        time: '19:34',
        fps: Number((29.9 + Math.random() * 0.2).toFixed(1)),
        sensors: 82 + (Math.random() > 0.5 ? 1 : 0),
      });
    }, 150);

    return () => clearInterval(timer);
  }, []);

  return (
    <div className={styles.framedCanvas}>
      {/* Wrapper with subtle Ken Burns camera drift */}
      <div className={styles.carlaImgWrapper}>
        <video
          ref={videoRef}
          src="/carla-sim.mp4"
          className={styles.carlaImg}
          autoPlay
          loop
          muted
          playsInline
        />
      </div>

      {/* Dynamic LiDAR radar scan canvas */}
      <LidarRadarOverlay />

      {/* Top Left Badge: Stream status */}
      <div className={styles.carlaBadgeTl}>
        <span className={styles.carlaBadgeDot} />
        <span>CARLA v0.9.14 · HD Map: 5th & Market</span>
        <span className={styles.liveTag}>● LIVE</span>
      </div>

      {/* Top Right Telemetry HUD */}
      <div className={styles.carlaTelemetry}>
        <div className={styles.carlaTelRow}>
          <span className={styles.carlaTelLabel}>SPEED</span>
          <span className={styles.carlaTelValue}>{telemetry.speed} km/h</span>
        </div>
        <div className={styles.carlaTelRow}>
          <span className={styles.carlaTelLabel}>SENSORS</span>
          <span className={styles.carlaTelValue} style={{ color: '#22d3ee' }}>
            {telemetry.sensors}% OK
          </span>
        </div>
        <div className={styles.carlaTelRow}>
          <span className={styles.carlaTelLabel}>FPS</span>
          <span className={styles.carlaTelValue}>{telemetry.fps}</span>
        </div>
      </div>

      {/* Quote at the bottom of the card */}
      <div className={styles.carlaQuote}>
        <blockquote className={styles.carlaQuoteText}>
          &ldquo;AI đề xuất. Hệ thống kiểm định. Con người quyết định.&rdquo;
        </blockquote>
        <cite className={styles.carlaQuoteCite}>— TRIẾT LÝ SCENARIO FORGE // DETERMINISTIC REPLAY</cite>
      </div>
    </div>
  );
}

/* --------------------------------------------------------
   Main LoginPage (Exact 1:1 Claude Layout Structure)
   -------------------------------------------------------- */
export function LoginPage() {
  const { loginWithGoogle, login, register, forgotPassword, resetPassword, logout, isLoading, isAuthenticated } = useAuth();
  const demoAccountEmail = process.env.NEXT_PUBLIC_DEMO_ACCOUNT_EMAIL ?? '';
  const demoAccountPassword = process.env.NEXT_PUBLIC_DEMO_ACCOUNT_PASSWORD ?? '';
  const hasDemoAccount = Boolean(demoAccountEmail && demoAccountPassword);
  // One card, four explicit states: sign in, create, identify, and reset.
  const [mode, setMode] = useState<'login' | 'register' | 'forgot' | 'reset'>('login');
  const [password, setPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  // Reveal state is per field: a shared toggle would unmask the confirmation
  // while the user is still typing the first password.
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [redirectTarget, setRedirectTarget] = useState<string>('/workspace');
  const [emailInput, setEmailInput] = useState<string>('');
  const stayOnAuthPageRef = useRef(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const err = params.get('error');
      const redir = params.get('redirect');
      if (err) setErrorMessage(decodeURIComponent(err));
      if (redir && redir.startsWith('/')) setRedirectTarget(redir);
    }
  }, []);

  useEffect(() => {
    if (isAuthenticated && !stayOnAuthPageRef.current && typeof window !== 'undefined') {
      window.location.href = redirectTarget;
    }
  }, [isAuthenticated, redirectTarget]);

  const handleGoogleLogin = async () => {
    setErrorMessage(null);
    try {
      await loginWithGoogle(redirectTarget);
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Đăng nhập Google thất bại');
    }
  };

  const fillDemoAccount = () => {
    setMode('login');
    setEmailInput(demoAccountEmail);
    setPassword(demoAccountPassword);
    setPasswordConfirmation('');
    setResetToken(null);
    setErrorMessage(null);
    setNotice(null);
  };

  // The submit handler stays the single source of rejection; these only drive
  // the inline affordances so the user sees the rule before pressing submit.
  const mismatch = passwordConfirmation.length > 0 && password !== passwordConfirmation;
  const passwordRules = [
    { label: 'Tối thiểu 8 ký tự', met: password.length >= 8 },
    { label: 'Hai lần nhập khớp nhau', met: password.length > 0 && password === passwordConfirmation },
  ];

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setNotice(null);
    setBusy(true);
    try {
      if (mode === 'forgot') {
        const result = await forgotPassword(emailInput.trim());
        setNotice(result.detail);
        if (result.reset_url) {
          const parsed = new URL(result.reset_url, window.location.origin);
          const token = parsed.searchParams.get('token');
          if (token) {
            setResetToken(token);
            setMode('reset');
          }
        }
        return;
      }
      if (mode === 'reset') {
        if (!resetToken) throw new Error('Yêu cầu đặt lại mật khẩu không còn hợp lệ.');
        if (password.length < 8) throw new Error('Mật khẩu mới cần ít nhất 8 ký tự.');
        if (password !== passwordConfirmation) throw new Error('Mật khẩu nhập lại chưa khớp.');
        stayOnAuthPageRef.current = true;
        await resetPassword(resetToken, password);
        await logout(false);
        setPassword('');
        setPasswordConfirmation('');
        setResetToken(null);
        setMode('login');
        setNotice('Mật khẩu đã được cập nhật. Bạn có thể đăng nhập ngay.');
        return;
      }
      if (mode === 'register') {
        if (password.length < 8) throw new Error('Mật khẩu cần ít nhất 8 ký tự.');
        if (password !== passwordConfirmation) throw new Error('Mật khẩu nhập lại chưa khớp.');
        stayOnAuthPageRef.current = true;
        const email = emailInput.trim();
        await register(email, password, email.split('@')[0]);
        await logout(false);
        setPassword('');
        setPasswordConfirmation('');
        setMode('login');
        setNotice('Đăng ký thành công. Mời bạn đăng nhập.');
        return;
      } else {
        await login(emailInput.trim(), password);
      }
      if (typeof window !== 'undefined') window.location.href = redirectTarget;
    } catch (err: unknown) {
      setErrorMessage(err instanceof Error ? err.message : 'Không thể hoàn tất yêu cầu.');
    } finally {
      stayOnAuthPageRef.current = false;
      setBusy(false);
    }
  };

  return (
    <main className={styles.loginContainer}>
      {/* ── Cột trái: Auth Portal chuẩn 1:1 phong cách Claude ── */}
      <section className={styles.leftSection}>
        {/* Brand Logo ở góc trên bên trái */}
        <a href="/" className={styles.brandHeader} aria-label="Về trang chủ Scenario Forge">
          <BrandMark className={styles.brandMark} />
          <span>Scenario Forge</span>
        </a>

        {/* Khối nội dung chính căn giữa */}
        <div className={styles.centerWrapper}>
          <h1 className={styles.title}>Vào đường thử nghiệm</h1>
          <p className={styles.subtitle}>
            Đối tác kiểm định kịch bản CARLA cho những tiêu chuẩn an toàn cao nhất
          </p>

          {/* Card trắng nổi (Floating Auth Card như Claude) */}
          <div className={styles.authCard}>
            {/* Nút Google SSO */}
            <button
              type="button"
              className={styles.googleButton}
              onClick={handleGoogleLogin}
              disabled={isLoading}
              data-testid="google-login-btn"
            >
              <svg className={styles.googleIcon} viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
              </svg>
              <span>{isLoading ? 'Đang kết nối...' : 'Tiếp tục với Google'}</span>
            </button>

            {/* Divider "hoặc" */}
            <div className={styles.divider}>HOẶC</div>

            {errorMessage ? (
              <div className={`${styles.feedback} ${styles.feedbackError}`} role="alert">
                <AlertCircle size={16} aria-hidden="true" />
                <span>{errorMessage}</span>
              </div>
            ) : notice ? (
              <div className={`${styles.feedback} ${mode === 'forgot' || mode === 'reset' ? styles.feedbackInfo : styles.feedbackSuccess}`} role="status" data-testid="auth-notice">
                {mode === 'forgot' || mode === 'reset' ? <Info size={16} aria-hidden="true" /> : <CheckCircle2 size={16} aria-hidden="true" />}
                <span>{notice}</span>
              </div>
            ) : null}

            {/* Form Email */}
            <form className={styles.emailForm} onSubmit={handleEmailSubmit}>
              <div className={styles.field}>
                <div className={`${styles.inputShell} ${mode === 'reset' ? styles.inputShellLocked : ''}`}>
                  <Mail className={styles.fieldIcon} size={16} aria-hidden="true" />
                  <input
                    id="auth-email"
                    type="email"
                    autoComplete="email"
                    className={styles.emailInput}
                    placeholder="ban@congty.vn"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    readOnly={mode === 'reset'}
                    required
                    data-testid="email-input"
                  />
                  <label className={styles.fieldLabel} htmlFor="auth-email">Địa chỉ e-mail</label>
                </div>
              </div>

              {mode !== 'forgot' ? (
                <div className={styles.field}>
                  <div className={styles.inputShell}>
                    <Lock className={styles.fieldIcon} size={16} aria-hidden="true" />
                    <input
                      id="auth-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                      className={`${styles.emailInput} ${styles.emailInputRevealable}`}
                      placeholder={mode === 'login' ? 'Nhập mật khẩu của bạn' : 'Tạo mật khẩu mạnh'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onKeyUp={(e) => setCapsLock(e.getModifierState('CapsLock'))}
                      onBlur={() => setCapsLock(false)}
                      minLength={mode === 'register' || mode === 'reset' ? 8 : undefined}
                      required
                      data-testid={mode === 'reset' ? 'new-password-input' : 'password-input'}
                    />
                    <label className={styles.fieldLabel} htmlFor="auth-password">
                      {mode === 'reset' ? 'Mật khẩu mới' : 'Mật khẩu'}
                    </label>
                    <button
                      type="button"
                      className={styles.revealButton}
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                      aria-pressed={showPassword}
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
                    </button>
                  </div>
                  {capsLock ? (
                    <p className={styles.fieldHint} data-testid="caps-lock-hint">
                      <AlertCircle size={13} aria-hidden="true" />
                      <span>Caps Lock đang bật.</span>
                    </p>
                  ) : null}
                </div>
              ) : null}

              {mode === 'register' || mode === 'reset' ? (
                <div className={styles.field}>
                  <div className={`${styles.inputShell} ${mismatch ? styles.inputShellError : ''}`}>
                    <Lock className={styles.fieldIcon} size={16} aria-hidden="true" />
                    <input
                      id="auth-password-confirmation"
                      type={showConfirmation ? 'text' : 'password'}
                      autoComplete="new-password"
                      className={`${styles.emailInput} ${styles.emailInputRevealable}`}
                      placeholder={mode === 'reset' ? 'Nhập lại mật khẩu mới' : 'Nhập lại mật khẩu vừa tạo'}
                      value={passwordConfirmation}
                      onChange={(e) => setPasswordConfirmation(e.target.value)}
                      minLength={8}
                      aria-invalid={mismatch}
                      required
                      data-testid={mode === 'reset' ? 'new-password-confirmation-input' : 'password-confirmation-input'}
                    />
                    <label className={styles.fieldLabel} htmlFor="auth-password-confirmation">Nhập lại mật khẩu</label>
                    <button
                      type="button"
                      className={styles.revealButton}
                      onClick={() => setShowConfirmation((v) => !v)}
                      aria-label={showConfirmation ? 'Ẩn mật khẩu nhập lại' : 'Hiện mật khẩu nhập lại'}
                      aria-pressed={showConfirmation}
                      tabIndex={-1}
                    >
                      {showConfirmation ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
                    </button>
                  </div>
                </div>
              ) : null}

              {mode === 'register' || mode === 'reset' ? (
                <ul className={styles.requirements} aria-live="polite">
                  {passwordRules.map((rule) => (
                    <li key={rule.label} className={rule.met ? styles.requirementMet : styles.requirement}>
                      <span className={styles.requirementDot} aria-hidden="true">
                        {rule.met ? <Check size={11} strokeWidth={3} /> : null}
                      </span>
                      <span>{rule.label}</span>
                    </li>
                  ))}
                </ul>
              ) : null}

              {mode === 'login' && hasDemoAccount ? (
                <button
                  type="button"
                  className={styles.demoFillButton}
                  onClick={fillDemoAccount}
                  disabled={isLoading || busy}
                  data-testid="demo-fill-button"
                >
                  Điền tài khoản demo
                </button>
              ) : null}
              <button
                type="submit"
                className={styles.submitEmailButton}
                disabled={isLoading || busy || !emailInput.trim() || ((mode === 'login' || mode === 'register' || mode === 'reset') && !password)}
              >
                <span>{busy || isLoading
                  ? 'Đang xử lý...'
                  : mode === 'register' ? 'Tạo tài khoản' : mode === 'forgot' ? 'Tiếp tục' : mode === 'reset' ? 'Đặt lại mật khẩu' : 'Đăng nhập'}</span>
              </button>
            </form>

            <div className={styles.modeSwitch}>
              {mode === 'login' ? (
                <>
                  <button type="button" onClick={() => { setMode('register'); setPassword(''); setPasswordConfirmation(''); setErrorMessage(null); setNotice(null); }}>Tạo tài khoản mới</button>
                  <button type="button" onClick={() => { setMode('forgot'); setPassword(''); setPasswordConfirmation(''); setErrorMessage(null); setNotice(null); }}>Quên mật khẩu?</button>
                </>
              ) : (
                <button type="button" onClick={() => { setMode('login'); setPassword(''); setPasswordConfirmation(''); setResetToken(null); setErrorMessage(null); setNotice(null); }}>Quay lại đăng nhập</button>
              )}
            </div>

            <div className={styles.cardDisclaimer}>
              Khi tiếp tục, bạn đồng ý với <a href="#">Điều khoản</a> và <a href="#">Chính sách bảo mật</a> của Scenario Forge.
            </div>
          </div>

          {/* Nút phụ pill bên dưới card (giống nút Download app của Claude) */}
          <a href="/" className={styles.secondaryPill} data-testid="dev-login-user">
            <ArrowLeft size={13} />
            <span>Quay lại trang chủ Scenario Forge</span>
          </a>
        </div>
      </section>

      {/* ── Cột phải: Framed Artwork Card (Khung tranh nổi bo góc tròn thanh lịch) ── */}
      <section className={styles.rightSection} aria-hidden="true">
        <CarlaHero />
      </section>
    </main>
  );
}
