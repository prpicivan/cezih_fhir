'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
    Shield, Smartphone, ArrowRight, CheckCircle, XCircle,
    Loader2, ArrowLeft, KeyRound, Fingerprint, ShieldCheck, Wifi
} from 'lucide-react';
import Image from 'next/image';

type AuthView =
    | 'login-options'
    | 'certilia-initiating'
    | 'certilia-form'
    | 'certilia-submitting'
    | 'certilia-waiting'
    | 'smartcard-waiting'
    | 'authenticated';

// ── Circular SVG countdown timer ──────────────────────────────────────────────
// Full circle = 60 seconds. Green arc shrinks as time elapses.
function CircleTimer({ seconds }: { seconds: number }) {
    const r = 54;
    const circumference = 2 * Math.PI * r; // ≈ 339.3
    const total = 60;
    const pct = Math.max(0, Math.min(seconds / total, 1));
    const dashOffset = circumference * (1 - pct);
    const mm = String(Math.floor(seconds / 60)).padStart(1, '0');
    const ss = String(seconds % 60).padStart(2, '0');

    return (
        <div className="relative flex items-center justify-center" style={{ width: 128, height: 128 }}>
            <svg width="128" height="128" style={{ transform: 'rotate(-90deg)' }}>
                {/* Background grey track */}
                <circle cx="64" cy="64" r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="10" />
                {/* Green progress arc */}
                <circle
                    cx="64" cy="64" r={r}
                    fill="none"
                    stroke="url(#timerGrad)"
                    strokeWidth="10"
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={dashOffset}
                    style={{ transition: 'stroke-dashoffset 1s linear' }}
                />
                <defs>
                    <linearGradient id="timerGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%" stopColor="#14b8a6" />
                        <stop offset="100%" stopColor="#10d9a0" />
                    </linearGradient>
                </defs>
            </svg>
            <div className="absolute flex flex-col items-center">
                <span style={{ fontFamily: 'monospace', fontSize: 28, fontWeight: 700, color: '#fff', lineHeight: 1 }}>
                    {mm}:{ss}
                </span>
                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', marginTop: 3 }}>preostalo</span>
            </div>
        </div>
    );
}

// ── Animated phone mock showing Certilia push screen ─────────────────────────
function CertiliaPhoneMock({ seconds }: { seconds: number }) {
    return (
        <div className="relative flex items-center justify-center" style={{ width: 200, height: 340 }}>

            {/* Pulse rings behind the phone */}
            {[0, 1, 2].map(i => (
                <div
                    key={i}
                    className="absolute rounded-full border border-indigo-400/20"
                    style={{
                        width: 180 + i * 44,
                        height: 300 + i * 44,
                        animation: `phone-pulse 2.4s ease-out ${i * 0.6}s infinite`,
                    }}
                />
            ))}

            {/* Phone shell */}
            <div style={{
                width: 160,
                height: 300,
                background: 'linear-gradient(160deg,#1e1b4b 0%,#0f172a 100%)',
                borderRadius: 28,
                border: '2px solid rgba(139,92,246,0.4)',
                boxShadow: '0 0 40px rgba(99,102,241,0.25), inset 0 1px 0 rgba(255,255,255,0.08)',
                position: 'relative',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
            }}>

                {/* Phone notch */}
                <div style={{ width: 48, height: 8, background: '#0f172a', borderRadius: 4, marginTop: 12 }} />

                {/* Status bar */}
                <div style={{ width: '100%', padding: '4px 14px 2px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace' }}>9:41</span>
                    <Wifi style={{ width: 9, height: 9, color: 'rgba(255,255,255,0.4)' }} />
                </div>

                {/* Certilia header bar */}
                <div style={{
                    width: '100%',
                    padding: '8px 14px 6px',
                    background: 'linear-gradient(135deg,#6366f1 0%,#8b5cf6 100%)',
                    display: 'flex', alignItems: 'center', gap: 6,
                }}>
                    <div style={{ width: 20, height: 20, borderRadius: 5, background: 'rgba(255,255,255,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <ShieldCheck style={{ width: 12, height: 12, color: '#fff' }} />
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', letterSpacing: 0.5 }}>Certilia</span>

                    {/* push badge */}
                    <div style={{
                        marginLeft: 'auto',
                        width: 16, height: 16, borderRadius: 8,
                        background: '#ef4444',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        animation: 'badge-bounce 1.2s ease-in-out infinite',
                    }}>
                        <span style={{ fontSize: 9, color: '#fff', fontWeight: 700 }}>1</span>
                    </div>
                </div>

                {/* Main content area */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px 12px 8px', width: '100%' }}>

                    {/* Request card */}
                    <div style={{
                        width: '100%',
                        background: 'rgba(255,255,255,0.06)',
                        border: '1px solid rgba(255,255,255,0.12)',
                        borderRadius: 12,
                        padding: '10px 10px 8px',
                        textAlign: 'center',
                        marginBottom: 10,
                    }}>
                        <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>ZAHTJEV ZA PRIJAVU</div>
                        <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.7)', marginBottom: 8 }}>WBS_FHIR portal</div>

                        {/* Mini timer inside phone */}
                        <div style={{ display: 'flex', justifyContent: 'center' }}>
                            <CircleTimer seconds={seconds} />
                        </div>
                    </div>

                    {/* Action buttons */}
                    <div style={{ display: 'flex', gap: 8, width: '100%' }}>
                        <div style={{
                            flex: 1, padding: '7px 0', borderRadius: 8,
                            background: 'rgba(239,68,68,0.15)',
                            border: '1px solid rgba(239,68,68,0.3)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            <span style={{ fontSize: 9, color: '#f87171', fontWeight: 700 }}>ODBIJ</span>
                        </div>
                        <div style={{
                            flex: 1, padding: '7px 0', borderRadius: 8,
                            background: 'linear-gradient(135deg,rgba(20,184,166,0.3),rgba(16,217,160,0.3))',
                            border: '1px solid rgba(20,184,166,0.5)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            <span style={{ fontSize: 9, color: '#2dd4bf', fontWeight: 700 }}>ODOBRI</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Wifi / signal dots floating top-right */}
            <div style={{ position: 'absolute', top: 10, right: -8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {[0, 1, 2].map(i => (
                    <div key={i} style={{
                        width: 5, height: 5, borderRadius: '50%',
                        background: '#14b8a6',
                        opacity: 0.6,
                        animation: `dot-blink 1.5s ease-in-out ${i * 0.3}s infinite`,
                    }} />
                ))}
            </div>
        </div>
    );
}

// ── Smart card reader image scene ──────────────────────────────────────────
function SmartCardMock({ phase }: { phase: number }) {
    return (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '16px 0 8px', position: 'relative' }}>
            <div style={{ width: 220, height: 160, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {/* Pulse rings */}
                {[0, 1, 2].map(i => (
                    <div key={i} style={{
                        position: 'absolute',
                        borderRadius: 16,
                        border: '1px solid rgba(99,102,241,0.15)',
                        width: 180 + i * 30,
                        height: 130 + i * 20,
                        animation: `sc-reader-pulse 2.4s ease-out ${i * 0.6}s infinite`,
                    }} />
                ))}

                {/* Card reader image */}
                <div style={{
                    position: 'relative', zIndex: 2,
                    filter: phase >= 3 ? 'drop-shadow(0 0 20px rgba(74,222,128,0.5))' : 'drop-shadow(0 0 16px rgba(99,102,241,0.3))',
                    transition: 'filter 0.8s',
                }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src="/card-reader.png"
                        alt="Smart card reader"
                        style={{
                            width: 140, height: 'auto',
                            borderRadius: 8,
                            opacity: 0.9,
                        }}
                    />
                    {/* Active indicator LED overlay */}
                    {phase >= 1 && (
                        <div style={{
                            position: 'absolute',
                            bottom: 8, right: 12,
                            width: 8, height: 8,
                            borderRadius: '50%',
                            background: phase >= 3 ? '#4ade80' : '#818cf8',
                            boxShadow: phase >= 3 ? '0 0 12px rgba(74,222,128,0.8)' : '0 0 10px rgba(99,102,241,0.6)',
                            animation: phase < 3 ? 'sc-led-blink 1.2s ease-in-out infinite' : 'none',
                        }} />
                    )}
                </div>
            </div>
        </div>
    );
}

// ── Main login page ───────────────────────────────────────────────────────────
export default function LoginPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const [systemStatus, setSystemStatus] = useState<'checking' | 'online' | 'offline'>('checking');
    const [authView, setAuthView] = useState<AuthView>('login-options');
    const [error, setError] = useState<string | null>(null);

    const [certiliaSessionId, setCertiliaSessionId] = useState<string | null>(null);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [stepMessage, setStepMessage] = useState('');

    // Countdown for certilia-waiting
    const [countdown, setCountdown] = useState(60);
    const countdownRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => { checkSystemStatus(); }, []);

    useEffect(() => {
        const authError = searchParams.get('auth_error');
        if (authError) setError(decodeURIComponent(authError));
    }, [searchParams]);

    // Start/stop countdown when entering/leaving certilia-waiting
    useEffect(() => {
        if (authView === 'certilia-waiting') {
            setCountdown(60);
            countdownRef.current = setInterval(() => {
                setCountdown(c => {
                    if (c <= 1) {
                        clearInterval(countdownRef.current!);
                        return 0;
                    }
                    return c - 1;
                });
            }, 1000);
        } else {
            if (countdownRef.current) clearInterval(countdownRef.current);
        }
        return () => { if (countdownRef.current) clearInterval(countdownRef.current); };
    }, [authView]);

    const checkSystemStatus = async () => {
        try {
            const res = await fetch('/api/health');
            setSystemStatus(res.ok ? 'online' : 'offline');
        } catch {
            setSystemStatus('offline');
        }
    };

    // ── Certilia login flow ───────────────────────────────────────────────────
    const handleCertiliaLogin = async () => {
        setError(null);
        setAuthView('certilia-initiating');
        setStepMessage('Povezivanje s CEZIH sustavom...');
        try {
            const res = await fetch('/api/auth/certilia/initiate', { method: 'POST' });
            const data = await res.json();
            if (!data.success) throw new Error(data.error || 'Inicijalizacija nije uspjela');
            setCertiliaSessionId(data.sessionId);
            setAuthView('certilia-form');
        } catch (err: any) {
            setError(err.message);
            setAuthView('login-options');
        }
    };

    const submitCertiliaCredentials = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setAuthView('certilia-submitting');
        setStepMessage('Provjera korisničkih podataka...');
        try {
            const res = await fetch('/api/auth/certilia/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId: certiliaSessionId, username, password }),
            });
            const data = await res.json();
            if (data.success && data.authenticated) {
                setAuthView('authenticated');
                setTimeout(() => router.push('/dashboard/patients'), 1500);
            } else if (data.pendingApproval) {
                setAuthView('certilia-waiting');
                pollForApproval(data.sessionId);
            } else {
                setError(data.error || 'Autentikacija nije uspjela');
                setAuthView('certilia-form');
            }
        } catch (err: any) {
            setError(err.message || 'Login failed');
            setAuthView('certilia-form');
        }
    };

    const pollForApproval = async (sid: string) => {
        const maxPolls = 40;
        for (let i = 0; i < maxPolls; i++) {
            await new Promise(r => setTimeout(r, 3000));
            try {
                const res = await fetch(`/api/auth/certilia/check?sessionId=${sid}`);
                const data = await res.json();
                if (data.success && data.authenticated) {
                    setAuthView('authenticated');
                    setTimeout(() => router.push('/dashboard/patients'), 1500);
                    return;
                } else if (data.success && data.pending) {
                    continue;
                } else if (!data.success) {
                    setError(data.error || 'Odobrenje nije uspjelo');
                    setAuthView('certilia-form');
                    return;
                }
            } catch { /* keep polling */ }
        }
        setError('Isteklo je vrijeme čekanja (2 min). Pokušajte ponovo.');
        setAuthView('certilia-form');
    };

    // ── Smart card flow ───────────────────────────────────────────────────────
    const [scPhase, setScPhase] = useState(0); // 0=outside, 1=inserting, 2=inserted

    const handleSmartCardLogin = async () => {
        setError(null);
        setScPhase(0);
        setAuthView('smartcard-waiting');
        setStepMessage('Pokrećem sigurnu vezu s CEZIH sustavom...');

        // Card insertion animation (visual only — doesn't affect stepper)
        setTimeout(() => setScPhase(1), 800);

        try {
            // Launch Chrome via Playwright (cert/PIN dialogs appear in Chrome window)
            const res = await fetch('/api/auth/smartcard/playwright-start', { method: 'POST' });
            const data = await res.json();
            if (!data.success) throw new Error(data.error || 'Pokretanje nije uspjelo');

            setStepMessage('Odaberite certifikat i unesite PIN u Chrome prozoru.');

            // Poll for auth status + playwright phase for intermediate stepper feedback
            const deadline = Date.now() + 6 * 60 * 1000;
            const pollId = setInterval(async () => {
                if (Date.now() > deadline) {
                    clearInterval(pollId);
                    setError('Isteklo je vrijeme čekanja (6 min). Pokušajte ponovo.');
                    setAuthView('login-options');
                    return;
                }
                try {
                    // Check auth status
                    const statusRes = await fetch('/api/auth/status');
                    const statusData = await statusRes.json();
                    if (statusData.authenticated) {
                        clearInterval(pollId);
                        setScPhase(3); // all steps completed
                        setTimeout(() => {
                            setAuthView('authenticated');
                            setTimeout(() => router.push('/dashboard/patients'), 1500);
                        }, 800); // brief pause to show all-green stepper
                        return;
                    }

                    // Check playwright phase for intermediate stepper updates
                    const phaseRes = await fetch('/api/auth/smartcard/playwright-status');
                    const phaseData = await phaseRes.json();
                    if (phaseData.phase === 'waiting-cert' || phaseData.phase === 'cookie-found' || phaseData.phase === 'done') {
                        // Cert dialog appeared or cookie captured — advance step 2 (cert selected)
                        setScPhase(prev => Math.max(prev, 2));
                    }
                } catch { /* keep polling */ }
            }, 2000);
        } catch (err: any) {
            setError(err.message);
            setAuthView('login-options');
        }
    };

    const goBack = () => {
        setAuthView('login-options');
        setError(null);
        setUsername('');
        setPassword('');
        setCertiliaSessionId(null);
    };

    const getStepProgress = () => {
        switch (authView) {
            case 'certilia-initiating': return { step: 1, total: 4, label: 'Povezivanje' };
            case 'certilia-form': return { step: 2, total: 4, label: 'Prijava' };
            case 'certilia-submitting': return { step: 3, total: 4, label: 'Provjera' };
            case 'certilia-waiting': return { step: 3, total: 4, label: 'Odobrenje' };
            case 'smartcard-waiting': return { step: 2, total: 3, label: 'Autentifikacija' };
            case 'authenticated': return { step: 4, total: 4, label: 'Gotovo' };
            default: return null;
        }
    };

    const progress = getStepProgress();

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(135deg, #0a0f1e 0%, #0d1a35 50%, #071225 100%)',
            padding: '1rem',
            position: 'relative',
            overflow: 'hidden',
            fontFamily: "'Inter', 'Segoe UI', Arial, sans-serif",
        }}>

            {/* CSS keyframes + Google font */}
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');

                @keyframes slide-up {
                    from { opacity: 0; transform: translateY(20px); }
                    to   { opacity: 1; transform: translateY(0); }
                }
                @keyframes fade-in {
                    from { opacity: 0; }
                    to   { opacity: 1; }
                }
                @keyframes bounce-check {
                    0%   { transform: scale(0); }
                    60%  { transform: scale(1.15); }
                    100% { transform: scale(1); }
                }
                @keyframes spin {
                    to { transform: rotate(360deg); }
                }
                @keyframes pulse-ring-anim {
                    0%   { transform: scale(0.95); opacity: 0.6; }
                    50%  { transform: scale(1.03); opacity: 1; }
                    100% { transform: scale(0.95); opacity: 0.6; }
                }
                @keyframes phone-pulse {
                    0%   { transform: scale(1);    opacity: 0.5; }
                    50%  { transform: scale(1.04); opacity: 0.25; }
                    100% { transform: scale(1.08); opacity: 0; }
                }
                @keyframes badge-bounce {
                    0%, 100% { transform: scale(1); }
                    50%      { transform: scale(1.25); }
                }
                @keyframes dot-blink {
                    0%, 100% { opacity: 0.2; }
                    50%      { opacity: 1; }
                }
                @keyframes orb-float {
                    0%, 100% { transform: translateY(0px) scale(1); }
                    50%      { transform: translateY(-20px) scale(1.05); }
                }
                @keyframes progress-fill {
                    from { width: 0%; }
                }
                @keyframes sc-reader-pulse {
                    0%   { transform: scale(1);    opacity: 0.5; }
                    50%  { transform: scale(1.05); opacity: 0.2; }
                    100% { transform: scale(1.1);  opacity: 0; }
                }
                @keyframes sc-led-blink {
                    0%, 100% { opacity: 1; }
                    50%      { opacity: 0.4; }
                }
                @keyframes sc-chip-pulse {
                    0%, 100% { box-shadow: inset 0 1px 0 rgba(255,255,255,0.4), 0 2px 4px rgba(0,0,0,0.3), 0 0 8px rgba(212,168,67,0.3); }
                    50%      { box-shadow: inset 0 1px 0 rgba(255,255,255,0.4), 0 2px 4px rgba(0,0,0,0.3), 0 0 20px rgba(212,168,67,0.7); }
                }
                .sc-outside  { transform: translateY(-70px) rotate(-2deg); }
                .sc-inserting { transform: translateY(-25px) rotate(0deg); }
                .sc-inserted  { transform: translateY(-10px) rotate(0deg); }
                .sc-led-idle {
                    background: rgba(255,255,255,0.15);
                    box-shadow: none;
                }
                .sc-led-active {
                    background: #4ade80;
                    box-shadow: 0 0 12px rgba(74,222,128,0.6);
                    animation: sc-led-blink 1s ease-in-out infinite;
                }
                .sc-led-reading {
                    background: #f59e0b;
                    box-shadow: 0 0 12px rgba(245,158,11,0.5);
                    animation: sc-led-blink 0.4s ease-in-out infinite;
                }
                .anim-slide-up   { animation: slide-up 0.4s ease-out forwards; }
                .anim-fade-in    { animation: fade-in 0.3s ease-out forwards; }
                .anim-bounce-check { animation: bounce-check 0.5s ease-out forwards; }
                .anim-spin       { animation: spin 1s linear infinite; }
                .anim-pulse-ring { animation: pulse-ring-anim 2s ease-in-out infinite; }
            `}</style>

            {/* Background ambient orbs */}
            <div style={{
                position: 'absolute', top: '10%', left: '15%',
                width: 320, height: 320, borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(99,102,241,0.12) 0%, transparent 70%)',
                animation: 'orb-float 7s ease-in-out infinite',
                pointerEvents: 'none',
            }} />
            <div style={{
                position: 'absolute', bottom: '8%', right: '12%',
                width: 400, height: 400, borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(20,184,166,0.08) 0%, transparent 70%)',
                animation: 'orb-float 9s ease-in-out 2s infinite',
                pointerEvents: 'none',
            }} />
            <div style={{
                position: 'absolute', top: '50%', right: '20%',
                width: 200, height: 200, borderRadius: '50%',
                background: 'radial-gradient(circle, rgba(139,92,246,0.1) 0%, transparent 70%)',
                animation: 'orb-float 5s ease-in-out 1s infinite',
                pointerEvents: 'none',
            }} />

            {/* ── Card ── */}
            <div style={{
                width: '100%',
                maxWidth: 420,
                background: 'rgba(255,255,255,0.04)',
                backdropFilter: 'blur(24px)',
                WebkitBackdropFilter: 'blur(24px)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 24,
                boxShadow: '0 32px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05) inset',
                overflow: 'hidden',
            }}>

                {/* ── Header ── */}
                <div style={{ padding: '32px 32px 16px', textAlign: 'center' }}>
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
                        <div style={{
                            width: 64, height: 64, borderRadius: 18,
                            background: 'rgba(255,255,255,0.08)',
                            border: '1px solid rgba(255,255,255,0.12)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            <Image src="/wbs-logo.png" alt="WBS Logo" width={44} height={44} style={{ objectFit: 'contain' }} />
                        </div>
                    </div>
                    <h1 style={{ fontSize: 22, fontWeight: 800, color: '#fff', margin: '0 0 4px', letterSpacing: -0.5 }}>
                        WBS_FHIR
                    </h1>
                    <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', margin: 0 }}>
                        {authView === 'login-options'
                            ? 'Sustav za digitalnu razmjenu podatka pacijenata i medicinske dokumentacije putem CEZIH-a'
                            : 'Prijava uspješna!'}
                    </p>
                </div>

                {/* ── System status ── */}
                <div style={{
                    margin: '0 24px 16px',
                    padding: '8px 14px',
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 10,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    fontSize: 12,
                }}>
                    <span style={{ color: 'rgba(255,255,255,0.4)' }}>Status sustava</span>
                    {systemStatus === 'checking' && <span style={{ color: 'rgba(255,255,255,0.3)' }}>Provjera...</span>}
                    {systemStatus === 'online' && (
                        <span style={{ color: '#4ade80', display: 'flex', alignItems: 'center', gap: 5, fontWeight: 600 }}>
                            <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#4ade80', display: 'inline-block', boxShadow: '0 0 6px #4ade80' }} />
                            Online
                        </span>
                    )}
                    {systemStatus === 'offline' && (
                        <span style={{ color: '#f87171', display: 'flex', alignItems: 'center', gap: 5, fontWeight: 600 }}>
                            <XCircle style={{ width: 14, height: 14 }} /> Offline
                        </span>
                    )}
                </div>

                {/* ── Progress bar ── */}
                {progress && (
                    <div style={{ margin: '0 24px 16px' }} className="anim-fade-in">
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 11 }}>
                            <span style={{ color: 'rgba(255,255,255,0.3)', fontWeight: 500 }}>Korak {progress.step}/{progress.total}</span>
                            <span style={{ color: '#14b8a6', fontWeight: 700 }}>{progress.label}</span>
                        </div>
                        <div style={{ height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 99, overflow: 'hidden' }}>
                            <div style={{
                                height: '100%',
                                width: `${(progress.step / progress.total) * 100}%`,
                                background: 'linear-gradient(90deg, #14b8a6, #10d9a0)',
                                borderRadius: 99,
                                transition: 'width 0.7s ease-out',
                            }} />
                        </div>
                    </div>
                )}

                {/* ── Error banner ── */}
                {error && (
                    <div className="anim-slide-up" style={{
                        margin: '0 24px 16px',
                        padding: '10px 14px',
                        background: 'rgba(239,68,68,0.12)',
                        border: '1px solid rgba(239,68,68,0.25)',
                        borderRadius: 10,
                        display: 'flex', alignItems: 'flex-start', gap: 8,
                    }}>
                        <XCircle style={{ width: 16, height: 16, color: '#f87171', flexShrink: 0, marginTop: 1 }} />
                        <span style={{ fontSize: 13, color: '#fca5a5' }}>{error}</span>
                    </div>
                )}

                {/* ══════════════════════════════════════════════════
                    VIEW: Login Options
                ══════════════════════════════════════════════════ */}
                {authView === 'login-options' && (
                    <div className="anim-slide-up" style={{ padding: '4px 24px 28px', display: 'flex', flexDirection: 'column', gap: 10 }}>

                        {/* Certilia button */}
                        <button
                            onClick={handleCertiliaLogin}
                            disabled={systemStatus !== 'online'}
                            style={{
                                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                padding: '14px 16px',
                                background: 'rgba(99,102,241,0.08)',
                                border: '1px solid rgba(99,102,241,0.25)',
                                borderRadius: 14, cursor: 'pointer', transition: 'all 0.2s',
                                opacity: systemStatus !== 'online' ? 0.5 : 1,
                            }}
                            onMouseEnter={e => {
                                (e.currentTarget as HTMLElement).style.background = 'rgba(99,102,241,0.16)';
                                (e.currentTarget as HTMLElement).style.borderColor = 'rgba(99,102,241,0.5)';
                                (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 20px rgba(99,102,241,0.15)';
                            }}
                            onMouseLeave={e => {
                                (e.currentTarget as HTMLElement).style.background = 'rgba(99,102,241,0.08)';
                                (e.currentTarget as HTMLElement).style.borderColor = 'rgba(99,102,241,0.25)';
                                (e.currentTarget as HTMLElement).style.boxShadow = 'none';
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                                <div style={{
                                    width: 44, height: 44, borderRadius: 12,
                                    background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    boxShadow: '0 4px 12px rgba(99,102,241,0.35)',
                                }}>
                                    <Smartphone style={{ width: 20, height: 20, color: '#fff' }} />
                                </div>
                                <div style={{ textAlign: 'left' }}>
                                    <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>Certilia mobile.ID</div>
                                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>Prijava putem mobilnog uređaja</div>
                                </div>
                            </div>
                            <ArrowRight style={{ width: 18, height: 18, color: 'rgba(255,255,255,0.25)' }} />
                        </button>

                        {/* Smart card button */}
                        <button
                            onClick={handleSmartCardLogin}
                            disabled={systemStatus !== 'online'}
                            style={{
                                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                padding: '14px 16px',
                                background: 'rgba(20,184,166,0.08)',
                                border: '1px solid rgba(20,184,166,0.2)',
                                borderRadius: 14, cursor: 'pointer', transition: 'all 0.2s',
                                opacity: systemStatus !== 'online' ? 0.5 : 1,
                            }}
                            onMouseEnter={e => {
                                (e.currentTarget as HTMLElement).style.background = 'rgba(20,184,166,0.14)';
                                (e.currentTarget as HTMLElement).style.borderColor = 'rgba(20,184,166,0.4)';
                                (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 20px rgba(20,184,166,0.12)';
                            }}
                            onMouseLeave={e => {
                                (e.currentTarget as HTMLElement).style.background = 'rgba(20,184,166,0.08)';
                                (e.currentTarget as HTMLElement).style.borderColor = 'rgba(20,184,166,0.2)';
                                (e.currentTarget as HTMLElement).style.boxShadow = 'none';
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                                <div style={{
                                    width: 44, height: 44, borderRadius: 12,
                                    background: 'linear-gradient(135deg, #0ea5e9, #14b8a6)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    boxShadow: '0 4px 12px rgba(20,184,166,0.3)',
                                }}>
                                    <Shield style={{ width: 20, height: 20, color: '#fff' }} />
                                </div>
                                <div style={{ textAlign: 'left' }}>
                                    <div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>Pametna Kartica</div>
                                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>Prijava putem čitača kartica</div>
                                </div>
                            </div>
                            <ArrowRight style={{ width: 18, height: 18, color: 'rgba(255,255,255,0.25)' }} />
                        </button>

                        <div style={{ textAlign: 'center', paddingTop: 4 }}>
                            <button
                                onClick={() => router.push('/dashboard/patients')}
                                style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)', background: 'none', border: 'none', cursor: 'pointer', transition: 'color 0.2s' }}
                                onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.5)')}
                                onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.25)')}
                            >
                                Demo pristup (bez autentikacije)
                            </button>
                        </div>
                    </div>
                )}

                {/* ══════════════════════════════════════════════════
                    VIEW: Initiating
                ══════════════════════════════════════════════════ */}
                {authView === 'certilia-initiating' && (
                    <div className="anim-slide-up" style={{ padding: '8px 24px 32px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>
                        <div style={{ position: 'relative', marginBottom: 20 }}>
                            <div className="anim-pulse-ring" style={{
                                width: 80, height: 80, borderRadius: '50%',
                                background: 'rgba(99,102,241,0.12)',
                                border: '1px solid rgba(99,102,241,0.2)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                                <Fingerprint style={{ width: 40, height: 40, color: '#6366f1' }} />
                            </div>
                            <div style={{
                                position: 'absolute', bottom: -4, right: -4,
                                width: 28, height: 28, borderRadius: '50%',
                                background: 'rgba(255,255,255,0.08)',
                                border: '1px solid rgba(255,255,255,0.12)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                                <Loader2 className="anim-spin" style={{ width: 16, height: 16, color: '#6366f1' }} />
                            </div>
                        </div>
                        <p style={{ fontSize: 15, fontWeight: 700, color: '#fff', margin: '0 0 6px', textAlign: 'center' }}>{stepMessage}</p>
                        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', textAlign: 'center', margin: '0 0 20px' }}>
                            Uspostavljanje veze s CEZIH gateway i Certilia servisom
                        </p>
                        <div style={{ display: 'flex', gap: 6 }}>
                            {[0, 1, 2].map(i => (
                                <div key={i} style={{
                                    width: 8, height: 8, borderRadius: '50%', background: '#6366f1',
                                    animation: `badge-bounce 1s ease-in-out ${i * 0.2}s infinite`,
                                }} />
                            ))}
                        </div>
                    </div>
                )}

                {/* ══════════════════════════════════════════════════
                    VIEW: Certilia Credential Form
                ══════════════════════════════════════════════════ */}
                {authView === 'certilia-form' && (
                    <form onSubmit={submitCertiliaCredentials} className="anim-slide-up" style={{ padding: '4px 24px 28px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                            <div style={{
                                width: 32, height: 32, borderRadius: 9,
                                background: 'rgba(99,102,241,0.15)',
                                border: '1px solid rgba(99,102,241,0.3)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                                <KeyRound style={{ width: 16, height: 16, color: '#818cf8' }} />
                            </div>
                            <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.7)' }}>
                                Unesite Certilia podatke za prijavu
                            </span>
                        </div>

                        {/* Username */}
                        <div>
                            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.5)', marginBottom: 6 }}>
                                E-mail ili OIB
                            </label>
                            <input
                                id="username" type="text" value={username}
                                onChange={e => setUsername(e.target.value)}
                                placeholder="npr. ime.prezime@email.hr"
                                autoFocus required
                                style={{
                                    width: '100%', padding: '11px 14px',
                                    background: 'rgba(255,255,255,0.06)',
                                    border: '1px solid rgba(255,255,255,0.12)',
                                    borderRadius: 10, outline: 'none',
                                    fontSize: 14, color: '#fff',
                                    boxSizing: 'border-box', transition: 'border-color 0.2s',
                                }}
                                onFocus={e => e.target.style.borderColor = 'rgba(99,102,241,0.6)'}
                                onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.12)'}
                            />
                        </div>

                        {/* Password */}
                        <div>
                            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.5)', marginBottom: 6 }}>
                                Lozinka
                            </label>
                            <input
                                id="password" type="password" value={password}
                                onChange={e => setPassword(e.target.value)}
                                placeholder="Certilia lozinka"
                                required
                                style={{
                                    width: '100%', padding: '11px 14px',
                                    background: 'rgba(255,255,255,0.06)',
                                    border: '1px solid rgba(255,255,255,0.12)',
                                    borderRadius: 10, outline: 'none',
                                    fontSize: 14, color: '#fff',
                                    boxSizing: 'border-box', transition: 'border-color 0.2s',
                                }}
                                onFocus={e => e.target.style.borderColor = 'rgba(99,102,241,0.6)'}
                                onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.12)'}
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={!username || !password}
                            style={{
                                width: '100%', padding: '12px',
                                background: !username || !password
                                    ? 'rgba(99,102,241,0.3)'
                                    : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                                border: 'none', borderRadius: 12, cursor: !username || !password ? 'not-allowed' : 'pointer',
                                fontSize: 14, fontWeight: 700, color: '#fff',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                                boxShadow: !username || !password ? 'none' : '0 4px 16px rgba(99,102,241,0.4)',
                                transition: 'all 0.2s',
                            }}
                        >
                            <Smartphone style={{ width: 16, height: 16 }} />
                            Prijavi se
                        </button>

                        <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', textAlign: 'center', margin: 0 }}>
                            Nakon prijave, odobrite zahtjev u Certilia mobilnoj aplikaciji.
                        </p>

                        <button
                            type="button" onClick={goBack}
                            style={{
                                background: 'none', border: 'none', cursor: 'pointer',
                                fontSize: 13, color: 'rgba(255,255,255,0.35)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                                transition: 'color 0.2s',
                            }}
                            onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.65)')}
                            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.35)')}
                        >
                            <ArrowLeft style={{ width: 14, height: 14 }} /> Natrag na odabir prijave
                        </button>
                    </form>
                )}

                {/* ══════════════════════════════════════════════════
                    VIEW: Submitting Credentials
                ══════════════════════════════════════════════════ */}
                {authView === 'certilia-submitting' && (
                    <div className="anim-slide-up" style={{ padding: '8px 24px 32px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <div style={{ position: 'relative', marginBottom: 20 }}>
                            <div className="anim-pulse-ring" style={{
                                width: 80, height: 80, borderRadius: '50%',
                                background: 'rgba(245,158,11,0.1)',
                                border: '1px solid rgba(245,158,11,0.2)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                                <KeyRound style={{ width: 38, height: 38, color: '#f59e0b' }} />
                            </div>
                            <div style={{
                                position: 'absolute', bottom: -4, right: -4,
                                width: 28, height: 28, borderRadius: '50%',
                                background: 'rgba(255,255,255,0.08)',
                                border: '1px solid rgba(255,255,255,0.12)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                                <Loader2 className="anim-spin" style={{ width: 16, height: 16, color: '#f59e0b' }} />
                            </div>
                        </div>
                        <p style={{ fontSize: 15, fontWeight: 700, color: '#fff', margin: '0 0 6px' }}>Provjera korisničkih podataka</p>
                        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', textAlign: 'center', margin: '0 0 20px' }}>
                            Certilia provjerava vaše podatke i priprema zahtjev
                        </p>
                        <div style={{ display: 'flex', gap: 6 }}>
                            {[0, 1, 2].map(i => (
                                <div key={i} style={{
                                    width: 8, height: 8, borderRadius: '50%', background: '#f59e0b',
                                    animation: `badge-bounce 1s ease-in-out ${i * 0.2}s infinite`,
                                }} />
                            ))}
                        </div>
                    </div>
                )}

                {/* ══════════════════════════════════════════════════
                    VIEW: certilia-waiting  ← main redesign
                ══════════════════════════════════════════════════ */}
                {authView === 'certilia-waiting' && (
                    <div className="anim-slide-up" style={{ padding: '8px 24px 28px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>

                        <h3 style={{ fontSize: 17, fontWeight: 800, color: '#fff', margin: '0 0 4px' }}>
                            Odobrenje na mobilnom uređaju
                        </h3>
                        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', textAlign: 'center', margin: '0 0 16px', maxWidth: 300 }}>
                            Otvorite <strong style={{ color: 'rgba(255,255,255,0.65)' }}>Certilia</strong> aplikaciju i pritisnite <strong style={{ color: '#4ade80' }}>ODOBRI</strong>
                        </p>

                        {/* Animated phone */}
                        <CertiliaPhoneMock seconds={countdown} />

                        {/* Step checklist */}
                        <div style={{ width: '100%', maxWidth: 300, display: 'flex', flexDirection: 'column', gap: 6, marginTop: 16 }}>
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                                background: 'rgba(74,222,128,0.08)',
                                border: '1px solid rgba(74,222,128,0.15)',
                                borderRadius: 10,
                            }}>
                                <CheckCircle style={{ width: 16, height: 16, color: '#4ade80', flexShrink: 0 }} />
                                <span style={{ fontSize: 12, color: '#4ade80' }}>Podaci provjereni</span>
                            </div>
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                                background: 'rgba(74,222,128,0.08)',
                                border: '1px solid rgba(74,222,128,0.15)',
                                borderRadius: 10,
                            }}>
                                <CheckCircle style={{ width: 16, height: 16, color: '#4ade80', flexShrink: 0 }} />
                                <span style={{ fontSize: 12, color: '#4ade80' }}>Push obavijest poslana</span>
                            </div>
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                                background: 'rgba(99,102,241,0.1)',
                                border: '1px solid rgba(99,102,241,0.25)',
                                borderRadius: 10,
                            }}>
                                <Loader2 className="anim-spin" style={{ width: 16, height: 16, color: '#818cf8', flexShrink: 0 }} />
                                <span style={{ fontSize: 12, color: '#818cf8', fontWeight: 600 }}>Čeka se odobrenje...</span>
                            </div>
                        </div>

                        <button
                            onClick={goBack}
                            style={{
                                marginTop: 16, background: 'none', border: 'none', cursor: 'pointer',
                                fontSize: 12, color: 'rgba(255,255,255,0.25)',
                                display: 'flex', alignItems: 'center', gap: 6, transition: 'color 0.2s',
                            }}
                            onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.5)')}
                            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.25)')}
                        >
                            <ArrowLeft style={{ width: 14, height: 14 }} /> Odustani
                        </button>
                    </div>
                )}

                {/* ══════════════════════════════════════════════════
                    VIEW: Smart Card Waiting (animated)
                ══════════════════════════════════════════════════ */}
                {authView === 'smartcard-waiting' && (
                    <div className="anim-slide-up" style={{ padding: '4px 24px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>

                        <h3 style={{ fontSize: 17, fontWeight: 800, color: '#fff', margin: '0 0 4px' }}>Prijava pametnom karticom</h3>
                        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', textAlign: 'center', margin: '0 0 8px', maxWidth: 300 }}>
                            Odaberite <strong style={{ color: 'rgba(255,255,255,0.65)' }}>certifikat</strong> u Windows dijalogu i unesite <strong style={{ color: 'rgba(255,255,255,0.65)' }}>PIN</strong>
                        </p>

                        {/* Animated card reader scene */}
                        <SmartCardMock phase={scPhase} />

                        {/* 4-step stepper */}
                        <div style={{ width: '100%', maxWidth: 300, display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                            {/* Step 1: Connected — always done */}
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                                background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.15)', borderRadius: 10,
                            }}>
                                <CheckCircle style={{ width: 16, height: 16, color: '#4ade80', flexShrink: 0 }} />
                                <span style={{ fontSize: 12, color: '#4ade80' }}>Povezivanje s CEZIH sustavom</span>
                            </div>

                            {/* Step 2: Select certificate — done when scPhase >= 2 */}
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                                background: scPhase >= 2 ? 'rgba(74,222,128,0.08)' : 'rgba(99,102,241,0.1)',
                                border: `1px solid ${scPhase >= 2 ? 'rgba(74,222,128,0.15)' : 'rgba(99,102,241,0.25)'}`,
                                borderRadius: 10, transition: 'all 0.5s',
                            }}>
                                {scPhase >= 2
                                    ? <CheckCircle style={{ width: 16, height: 16, color: '#4ade80', flexShrink: 0 }} />
                                    : <Loader2 className="anim-spin" style={{ width: 16, height: 16, color: '#818cf8', flexShrink: 0 }} />
                                }
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <span style={{ fontSize: 12, color: scPhase >= 2 ? '#4ade80' : '#a5b4fc', fontWeight: 600 }}>Odabir certifikata</span>
                                    {scPhase < 2 && <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 1 }}>Odaberite certifikat u Chrome prozoru</span>}
                                </div>
                            </div>

                            {/* Step 3: Enter PIN — active when scPhase === 2 */}
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                                background: scPhase >= 3 ? 'rgba(74,222,128,0.08)' : scPhase === 2 ? 'rgba(99,102,241,0.1)' : 'rgba(255,255,255,0.03)',
                                border: `1px solid ${scPhase >= 3 ? 'rgba(74,222,128,0.15)' : scPhase === 2 ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.08)'}`,
                                borderRadius: 10, transition: 'all 0.5s',
                            }}>
                                {scPhase >= 3
                                    ? <CheckCircle style={{ width: 16, height: 16, color: '#4ade80', flexShrink: 0 }} />
                                    : scPhase === 2
                                        ? <Loader2 className="anim-spin" style={{ width: 16, height: 16, color: '#818cf8', flexShrink: 0 }} />
                                        : <div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.15)', flexShrink: 0 }} />
                                }
                                <span style={{ fontSize: 12, color: scPhase >= 3 ? '#4ade80' : scPhase === 2 ? '#a5b4fc' : 'rgba(255,255,255,0.25)', fontWeight: scPhase >= 2 ? 600 : 400 }}>Unos PIN-a</span>
                            </div>

                            {/* Step 4: Login */}
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                                background: scPhase >= 3 ? 'rgba(74,222,128,0.08)' : 'rgba(255,255,255,0.03)',
                                border: `1px solid ${scPhase >= 3 ? 'rgba(74,222,128,0.15)' : 'rgba(255,255,255,0.08)'}`,
                                borderRadius: 10, transition: 'all 0.5s',
                            }}>
                                {scPhase >= 3
                                    ? <CheckCircle style={{ width: 16, height: 16, color: '#4ade80', flexShrink: 0 }} />
                                    : <div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.15)', flexShrink: 0 }} />
                                }
                                <span style={{ fontSize: 12, color: scPhase >= 3 ? '#4ade80' : 'rgba(255,255,255,0.25)' }}>Prijava u sustav</span>
                            </div>
                        </div>

                        <button
                            onClick={goBack}
                            style={{
                                marginTop: 14, background: 'none', border: 'none', cursor: 'pointer',
                                fontSize: 12, color: 'rgba(255,255,255,0.25)',
                                display: 'flex', alignItems: 'center', gap: 6, transition: 'color 0.2s',
                            }}
                            onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.5)')}
                            onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.25)')}
                        >
                            <ArrowLeft style={{ width: 14, height: 14 }} /> Odustani
                        </button>
                    </div>
                )}

                {/* ══════════════════════════════════════════════════
                    VIEW: Authenticated
                ══════════════════════════════════════════════════ */}
                {authView === 'authenticated' && (
                    <div className="anim-slide-up" style={{ padding: '8px 24px 32px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <div className="anim-bounce-check" style={{
                            width: 84, height: 84, borderRadius: '50%',
                            background: 'rgba(74,222,128,0.12)',
                            border: '1px solid rgba(74,222,128,0.3)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            marginBottom: 16,
                            boxShadow: '0 0 40px rgba(74,222,128,0.2)',
                        }}>
                            <ShieldCheck style={{ width: 44, height: 44, color: '#4ade80' }} />
                        </div>
                        <h3 style={{ fontSize: 18, fontWeight: 800, color: '#4ade80', margin: '0 0 6px' }}>Autentikacija uspješna!</h3>
                        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', margin: '0 0 20px' }}>Preusmjeravanje na sustav...</p>
                        <div style={{ width: 200, height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 99, overflow: 'hidden' }}>
                            <div style={{
                                height: '100%',
                                background: 'linear-gradient(90deg, #4ade80, #14b8a6)',
                                borderRadius: 99,
                                animation: 'progress-fill 1.5s ease-out forwards',
                                width: '100%',
                            }} />
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
}
