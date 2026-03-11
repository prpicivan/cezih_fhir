'use client';
import { useEffect, useRef, useState } from 'react';
import { Shield, Smartphone, ArrowRight, ShieldCheck, Wifi, Loader2, CheckCircle, XCircle, Key, UserCheck, CreditCard } from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────
type Phase = 
    | 'method-select' 
    | 'sc-cert-select' 
    | 'sc-pin-entry' 
    | 'smartcard-progress' 
    | 'certilia-waiting' 
    | 'success' 
    | 'error';

type StepState = 'pending' | 'active' | 'done' | 'error';

const SC_STEPS = [
    { key: 'cert', label: 'Provjera certifikata', sub: 'Pristup privatnom ključu' },
    { key: 'pin', label: 'Provjera PIN-a', sub: 'Autorizacija pristupa' },
    { key: 'sign', label: 'Potpisivanje', sub: 'PKCS#11 operacija' },
    { key: 'cezih', label: 'Slanje na CEZIH', sub: 'FHIR poruka' },
];

interface IdenSigningModalProps {
    open: boolean;
    actionLabel: string;
    signingFn: () => Promise<{ success: boolean; error?: string }>;
    onDone: (success: boolean) => void;
    onCancel?: () => void;
}

// ── Circular SVG countdown timer ───────────────────────────────────────────
function CircleTimer({ seconds }: { seconds: number }) {
    const r = 40;
    const circumference = 2 * Math.PI * r;
    const total = 60;
    const pct = Math.max(0, Math.min(seconds / total, 1));
    const dashOffset = circumference * (1 - pct);
    const mm = String(Math.floor(seconds / 60)).padStart(1, '0');
    const ss = String(seconds % 60).padStart(2, '0');

    return (
        <div className="relative flex items-center justify-center" style={{ width: 100, height: 100 }}>
            <svg width="100" height="100" style={{ transform: 'rotate(-90deg)' }}>
                <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="6" />
                <circle
                    cx="50" cy="50" r={r}
                    fill="none"
                    stroke="#14b8a6"
                    strokeWidth="6"
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={dashOffset}
                    style={{ transition: 'stroke-dashoffset 1s linear' }}
                />
            </svg>
            <div className="absolute flex flex-col items-center">
                <span style={{ fontFamily: 'monospace', fontSize: 18, fontWeight: 700, color: '#fff' }}>
                    {mm}:{ss}
                </span>
            </div>
        </div>
    );
}

// ── Animated phone mock ───────────────────────────────────────────────────
function CertiliaPhoneMock({ seconds }: { seconds: number }) {
    return (
        <div className="relative flex items-center justify-center" style={{ width: 140, height: 240 }}>
            {[0, 1].map(i => (
                <div
                    key={i}
                    className="absolute rounded-full border border-indigo-400/20"
                    style={{
                        width: 120 + i * 30,
                        height: 220 + i * 30,
                        animation: `phone-pulse 2.4s ease-out ${i * 0.6}s infinite`,
                    }}
                />
            ))}
            <div style={{
                width: 120, height: 220,
                background: 'linear-gradient(160deg,#1e1b4b 0%,#0f172a 100%)',
                borderRadius: 20, border: '2px solid rgba(139,92,246,0.4)',
                boxShadow: '0 0 30px rgba(99,102,241,0.25)',
                position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', alignItems: 'center',
            }}>
                <div style={{ width: 30, height: 6, background: '#0f172a', borderRadius: 3, marginTop: 8 }} />
                <div style={{ width: '100%', padding: '4px 8px', display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 7, color: 'rgba(255,255,255,0.4)' }}>9:41</span>
                    <Wifi style={{ width: 8, height: 8, color: 'rgba(255,255,255,0.3)' }} />
                </div>
                <div style={{ width: '100%', padding: '6px', background: 'linear-gradient(135deg,#6366f1 0%,#8b5cf6 100%)', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <ShieldCheck style={{ width: 10, height: 10, color: '#fff' }} />
                    <span style={{ fontSize: 8, fontWeight: 700, color: '#fff' }}>Certilia</span>
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px 8px', width: '100%', gap: 8 }}>
                    <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: '8px', width: '100%', textAlign: 'center' }}>
                        <div style={{ fontSize: 7, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>POTPIS DOKUMENTA</div>
                        <CircleTimer seconds={seconds} />
                        <div style={{ fontSize: 6, color: 'rgba(255,255,255,0.3)', marginTop: 4 }}>CEZIH FHIR SIGNATURE</div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ── Smart Card visual ─────────────────────────────────────────────────────
function SmartCardMock({ scPhase }: { scPhase: number }) {
    return (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0', position: 'relative' }}>
            <div style={{ width: 180, height: 120, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {[0, 1].map(i => (
                    <div key={i} style={{
                        position: 'absolute',
                        borderRadius: 12,
                        border: '1px solid rgba(99,102,241,0.1)',
                        width: 140 + i * 20,
                        height: 100 + i * 15,
                        animation: `sc-reader-pulse 2.4s ease-out ${i * 0.6}s infinite`,
                    }} />
                ))}
                <div style={{
                    position: 'relative', zIndex: 2,
                    filter: scPhase >= 3 ? 'drop-shadow(0 0 15px rgba(74,222,128,0.4))' : 'drop-shadow(0 0 12px rgba(99,102,241,0.2))',
                    transition: 'filter 0.8s',
                }}>
                    <img
                        src="/card-reader.png"
                        alt="Smart card reader"
                        style={{ width: 110, height: 'auto', borderRadius: 6, opacity: 0.9 }}
                    />
                    <div style={{
                        position: 'absolute', bottom: 6, right: 10, width: 6, height: 6, borderRadius: '50%',
                        background: scPhase >= 4 ? '#4ade80' : '#818cf8',
                        boxShadow: scPhase >= 4 ? '0 0 10px rgba(74,222,128,0.7)' : '0 0 8px rgba(99,102,241,0.5)',
                        animation: scPhase < 4 ? 'sc-led-blink 1.2s ease-in-out infinite' : 'none',
                    }} />
                </div>
            </div>
        </div>
    );
}

export default function IdenSigningModal({ open, actionLabel, signingFn, onDone, onCancel }: IdenSigningModalProps) {
    const [phase, setPhase] = useState<Phase>('method-select');
    const [stepStates, setStepStates] = useState<StepState[]>(['pending', 'pending', 'pending', 'pending']);
    const [errorMsg, setErrorMsg] = useState('');
    const [timer, setTimer] = useState(60);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    
    // Interactive SC states
    const [selectedCert, setSelectedCert] = useState<string | null>(null);
    const [pin, setPin] = useState('');

    // Status and Ref tracking
    const [isProcessing, setIsProcessing] = useState(false);
    const hasStartedRef = useRef(false);

    // Skip check
    useEffect(() => {
        if (open && typeof window !== 'undefined' && !hasStartedRef.current) {
            const shouldSkip = localStorage.getItem('skip_iden_modal') === 'true';
            if (shouldSkip) {
                hasStartedRef.current = true;
                setIsProcessing(true);
                signingFn().then(res => onDone(res.success));
            }
        }
    }, [open, signingFn, onDone]);

    // Reset when modal opens/closes
    useEffect(() => {
        if (!open) {
            setPhase('method-select');
            setStepStates(['pending', 'pending', 'pending', 'pending']);
            setErrorMsg('');
            setTimer(60);
            setSelectedCert(null);
            setPin('');
            setIsProcessing(false);
            hasStartedRef.current = false;
            if (timerRef.current) clearInterval(timerRef.current);
        }
    }, [open]);

    if (!open) return null;
    if (typeof window !== 'undefined' && localStorage.getItem('skip_iden_modal') === 'true') {
        if (!hasStartedRef.current) return null; // Wait for useEffect to finish/close
    }

    const startTimer = () => {
        setTimer(60);
        timerRef.current = setInterval(() => {
            setTimer(t => {
                if (t <= 1) { clearInterval(timerRef.current!); return 0; }
                return t - 1;
            });
        }, 1000);
    };

    const runCertiliaFlow = async () => {
        if (isProcessing) return;
        setIsProcessing(true);
        hasStartedRef.current = true;
        setPhase('certilia-waiting');
        startTimer();
        
        // Simulating some "init" time
        await delay(1500);
        
        const result = await signingFn();
        if (timerRef.current) clearInterval(timerRef.current);
        
        if (result.success) {
            setPhase('success');
            setTimeout(() => onDone(true), 1500);
        } else {
            setErrorMsg(result.error || 'Autentifikacija putem Certilia mobile.ID nije uspjela.');
            setPhase('error');
            setIsProcessing(false);
        }
    };

    const runSmartcardFlow = async () => {
        if (isProcessing) return;
        setIsProcessing(true);
        hasStartedRef.current = true;
        setPhase('smartcard-progress');
        const setStep = (idx: number, state: StepState) =>
            setStepStates(prev => prev.map((s, i) => i === idx ? state : s));

        setStep(0, 'active');
        await delay(800);
        setStep(0, 'done');
        setStep(1, 'active');
        await delay(1000);
        setStep(1, 'done');
        setStep(2, 'active');
        await delay(600);
        setStep(2, 'done');
        setStep(3, 'active');

        const result = await signingFn();
        
        if (result.success) {
            setStep(3, 'done');
            setPhase('success');
            setTimeout(() => onDone(true), 1500);
        } else {
            setStep(3, 'error');
            setErrorMsg(result.error || 'Greška pri radu s pametnom karticom / certifikatom.');
            setPhase('error');
            setIsProcessing(false);
        }
    };

    const handleSelectCert = (certName: string) => {
        setSelectedCert(certName);
        setPhase('sc-pin-entry');
    };

    const handlePinSubmit = () => {
        if (pin.length === 6 && !isProcessing) {
            runSmartcardFlow();
        }
    };

    return (
        <div style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(6, 10, 22, 0.85)',
            backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        }}>
            <style>{`
                @keyframes iden-fade-in { from { opacity:0; } to { opacity:1; } }
                @keyframes iden-slide-up { from { opacity:0; transform:translateY(22px) scale(.98); } to { opacity:1; transform:translateY(0) scale(1); } }
                @keyframes phone-pulse { 0% { transform: scale(1); opacity: 0.5; } 50% { transform: scale(1.04); opacity: 0.25; } 100% { transform: scale(1.08); opacity: 0; } }
                @keyframes sc-reader-pulse { 0% { transform: scale(1); opacity: 0.5; } 50% { transform: scale(1.05); opacity: 0.2; } 100% { transform: scale(1.1); opacity: 0; } }
                @keyframes sc-led-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
                @keyframes sc-cert-item { from { opacity:0; transform:translateX(-10px); } to { opacity:1; transform:translateX(0); } }
                .pin-dot { width: 12px; height: 12px; border-radius: 50%; border: 1.5px solid rgba(255,255,255,0.2); transition: all 0.2s; }
                .pin-dot.filled { background: #fff; border-color: #fff; box-shadow: 0 0 10px #fff; }
            `}</style>

            <div style={{
                width: '100%', maxWidth: 420,
                background: 'rgba(255,255,255,.05)',
                backdropFilter: 'blur(30px)', WebkitBackdropFilter: 'blur(30px)',
                border: '1px solid rgba(255,255,255,.1)', borderRadius: 28,
                boxShadow: '0 40px 120px rgba(0,0,0,.6)',
                color: '#fff', overflow: 'hidden',
                animation: 'iden-slide-up .4s cubic-bezier(.22,.68,0,1.1)',
            }}>
                <div style={{ padding: '30px 28px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    
                    {/* Header */}
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
                        <div style={{ width: 56, height: 56, borderRadius: 16, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <img src="/wbs-logo.png" alt="WBS" style={{ width: 38, height: 38, objectFit: 'contain' }} />
                        </div>
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 800, textAlign: 'center', marginBottom: 4 }}>Digitalni potpis (IDEN)</div>
                    <div style={{ fontSize: 13, color: 'rgba(255,255,255,.4)', textAlign: 'center', marginBottom: 24, lineHeight: 1.5 }}>
                        Akcija: <strong style={{ color: 'rgba(255,255,255,.7)' }}>{actionLabel}</strong>
                    </div>

                    {/* PHASE: method-select */}
                    {phase === 'method-select' && (
                        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <button onClick={runCertiliaFlow} style={{
                                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                padding: '16px 20px', borderRadius: 16, cursor: 'pointer',
                                background: 'rgba(99,102,241,.08)', border: '1px solid rgba(99,102,241,.2)',
                                color: '#fff', fontFamily: 'inherit', textAlign: 'left', transition: 'all .2s',
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                                    <div style={{ width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(99,102,241,.3)' }}>
                                        <Smartphone style={{ width: 22, height: 22, color: '#fff' }} />
                                    </div>
                                    <div>
                                        <div style={{ fontSize: 15, fontWeight: 700 }}>Certilia mobile.ID</div>
                                        <div style={{ fontSize: 12, color: 'rgba(255,255,255,.35)' }}>Odobrenje putem mobilne aplikacije</div>
                                    </div>
                                </div>
                                <ArrowRight style={{ width: 18, height: 18, color: 'rgba(255,255,255,.2)' }} />
                            </button>

                            <button onClick={() => setPhase('sc-cert-select')} style={{
                                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                padding: '16px 20px', borderRadius: 16, cursor: 'pointer',
                                background: 'rgba(20,184,166,.08)', border: '1px solid rgba(20,184,166,.2)',
                                color: '#fff', fontFamily: 'inherit', textAlign: 'left', transition: 'all .2s',
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                                    <div style={{ width: 44, height: 44, borderRadius: 12, background: 'linear-gradient(135deg, #0ea5e9, #14b8a6)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(20,184,166,.3)' }}>
                                        <Shield style={{ width: 22, height: 22, color: '#fff' }} />
                                    </div>
                                    <div>
                                        <div style={{ fontSize: 15, fontWeight: 700 }}>Pametna Kartica</div>
                                        <div style={{ fontSize: 12, color: 'rgba(255,255,255,.35)' }}>IDEN PIN i čitač kartica</div>
                                    </div>
                                </div>
                                <ArrowRight style={{ width: 18, height: 18, color: 'rgba(255,255,255,.2)' }} />
                            </button>

                            {onCancel && (
                                <button onClick={onCancel} style={{ marginTop: 10, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'rgba(255,255,255,.2)', fontFamily: 'inherit' }}>
                                    Odustani
                                </button>
                            )}
                        </div>
                    )}

                    {/* PHASE: sc-cert-select */}
                    {phase === 'sc-cert-select' && (
                        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 14 }}>
                            <div style={{ fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.6)', textAlign: 'center', marginBottom: 6 }}>Odaberite certifikat:</div>
                            {[
                                { name: 'Lovro Lovrić', oib: '12345678901', issuer: 'AKD IDEN CA' },
                                { name: 'Health Service Admin', oib: '00000000000', issuer: 'AKD IDEN CA' }
                            ].map((c, i) => (
                                <button key={i} onClick={() => handleSelectCert(c.name)} style={{
                                    width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: 16,
                                    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
                                    cursor: 'pointer', color: '#fff', textAlign: 'left', animation: `sc-cert-item 0.4s ease-out ${i*0.1}s forwards`,
                                }}>
                                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <UserCheck style={{ width: 18, height: 18, color: 'rgba(255,255,255,0.4)' }} />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: 14, fontWeight: 700 }}>{c.name}</div>
                                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>{c.issuer} | OIB: {c.oib}</div>
                                    </div>
                                </button>
                            ))}
                            <button onClick={() => setPhase('method-select')} style={{ marginTop: 10, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'rgba(255,255,255,.2)' }}>Nazad</button>
                        </div>
                    )}

                    {/* PHASE: sc-pin-entry */}
                    {phase === 'sc-pin-entry' && (
                        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Unos IDEN PIN-a</div>
                                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>Unesite 6 znamenki za certifikat <strong style={{ color: '#fff' }}>{selectedCert}</strong></div>
                            </div>
                            
                            <div style={{ display: 'flex', gap: 12 }}>
                                {[...Array(6)].map((_, i) => (
                                    <div key={i} className={`pin-dot ${pin.length > i ? 'filled' : ''}`} />
                                ))}
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, width: '100%', maxWidth: 200 }}>
                                {[1, 2, 3, 4, 5, 6, 7, 8, 9, '✖', 0, '✓'].map((k, i) => (
                                    <button
                                        key={i}
                                        onClick={() => {
                                            if (k === '✓') handlePinSubmit();
                                            else if (k === '✖') setPin(p => p.slice(0, -1));
                                            else if (typeof k === 'number' && pin.length < 6) setPin(p => p + k);
                                        }}
                                        style={{
                                            width: 50, height: 50, borderRadius: '50%', background: 'rgba(255,255,255,0.05)',
                                            border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: 16, fontWeight: 700,
                                            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s'
                                        }}
                                        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.12)')}
                                        onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                                    >
                                        {k}
                                    </button>
                                ))}
                            </div>
                            
                            <button onClick={() => setPhase('sc-cert-select')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'rgba(255,255,255,.2)' }}>Promijeni certifikat</button>
                        </div>
                    )}

                    {/* PHASE: certilia-waiting */}
                    {phase === 'certilia-waiting' && (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
                            <CertiliaPhoneMock seconds={timer} />
                            <div style={{ fontSize: 15, fontWeight: 700, color: '#a5b4fc', marginTop: 16, marginBottom: 4 }}>Čekam odobrenje…</div>
                            <div style={{ fontSize: 12, color: 'rgba(255,255,255,.35)', textAlign: 'center', maxWidth: 280, lineHeight: 1.6 }}>
                                Otvorite <strong style={{ color: '#fff' }}>Certilia</strong> aplikaciju na svom mobilnom uređaju i odobrite zahtjev za potpisivanje.
                            </div>
                            <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 8, color: 'rgba(255,255,255,0.2)', fontSize: 10 }}>
                                <Loader2 className="w-3 h-3 animate-spin" />
                                Provjera statusa autentifikacije...
                            </div>
                        </div>
                    )}

                    {/* PHASE: smartcard-progress */}
                    {phase === 'smartcard-progress' && (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
                            <SmartCardMock scPhase={stepStates.filter(s => s === 'done').length} />
                            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {SC_STEPS.map((s, i) => (
                                    <div key={s.key} style={{
                                        display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 12,
                                        background: stepStates[i] === 'active' ? 'rgba(99,102,241,.1)' : 'rgba(255,255,255,.02)',
                                        border: stepStates[i] === 'active' ? '1px solid rgba(99,102,241,.3)' : '1px solid rgba(255,255,255,.05)',
                                        opacity: stepStates[i] === 'pending' ? 0.4 : 1, transition: 'all .3s',
                                    }}>
                                        <div style={{ width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                            {stepStates[i] === 'done' && <CheckCircle style={{ width: 16, height: 16, color: '#4ade80' }} />}
                                            {stepStates[i] === 'active' && <Loader2 style={{ width: 16, height: 16, color: '#6366f1' }} className="animate-spin" />}
                                            {stepStates[i] === 'error' && <XCircle style={{ width: 16, height: 16, color: '#f87171' }} />}
                                            {stepStates[i] === 'pending' && <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'rgba(255,255,255,.2)' }} />}
                                        </div>
                                        <div>
                                            <div style={{ fontSize: 13, fontWeight: stepStates[i] === 'active' ? 700 : 500 }}>{s.label}</div>
                                            <div style={{ fontSize: 10, color: 'rgba(255,255,255,.3)' }}>{s.sub}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* PHASE: success */}
                    {phase === 'success' && (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '20px 0' }}>
                            <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(74,222,128,.15)', border: '1px solid rgba(74,222,128,.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <CheckCircle style={{ width: 32, height: 32, color: '#4ade80' }} />
                            </div>
                            <div style={{ fontSize: 16, fontWeight: 800, color: '#4ade80' }}>Uspješno potpisano!</div>
                            <div style={{ fontSize: 11, color: 'rgba(255,255,255,.3)' }}>Podaci su poslani na CEZIH.</div>
                        </div>
                    )}

                    {/* PHASE: error */}
                    {phase === 'error' && (
                        <div style={{ width: '100%', textAlign: 'center' }}>
                            <div style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 12, padding: '16px', marginBottom: 16 }}>
                                <div style={{ fontSize: 13, color: '#fca5a5', fontWeight: 700, marginBottom: 4 }}>Greška pri potpisivanju</div>
                                <div style={{ fontSize: 12, color: 'rgba(255,255,255,.4)' }}>{errorMsg}</div>
                            </div>
                            <button onClick={() => setPhase('method-select')} style={{ width: '100%', padding: '12px', background: '#6366f1', color: '#fff', borderRadius: 12, border: 'none', fontWeight: 700, cursor: 'pointer', marginBottom: 8 }}>Pokušaj ponovo</button>
                            <button onClick={onCancel} style={{ width: '100%', padding: '12px', background: 'transparent', color: 'rgba(255,255,255,.4)', borderRadius: 12, border: '1px solid rgba(255,255,255,.1)', cursor: 'pointer' }}>Odustani</button>
                        </div>
                    )}

                </div>
            </div>
        </div>
    );
}

function delay(ms: number) { return new Promise(r => setTimeout(r, ms)); }
