'use client';
import { useEffect, useRef, useState } from 'react';

// Steps that appear in the progress stepper for IDEN actions
const IDEN_STEPS = [
    { key: 'cert', label: 'Odabir certifikata', sub: 'Windows dijalog s certifikatom' },
    { key: 'pin', label: 'Unos IDEN PIN-a', sub: 'Windows sigurnosni upit' },
    { key: 'sign', label: 'Potpisivanje', sub: 'PKCS#11 operacija' },
    { key: 'cezih', label: 'Slanje na CEZIH', sub: 'FHIR poruka' },
];

type StepState = 'pending' | 'active' | 'done' | 'error';

interface IdenSigningModalProps {
    open: boolean;
    actionLabel: string;           // e.g. "Kreiranje posjeta (TC12)"
    signingFn: () => Promise<{ success: boolean; error?: string }>;
    onDone: (success: boolean) => void;
    onCancel?: () => void;
}

export default function IdenSigningModal({ open, actionLabel, signingFn, onDone, onCancel }: IdenSigningModalProps) {
    const [phase, setPhase] = useState<'idle' | 'signing' | 'success' | 'error'>('idle');
    const [stepStates, setStepStates] = useState<StepState[]>(['pending', 'pending', 'pending', 'pending']);
    const [errorMsg, setErrorMsg] = useState('');
    const started = useRef(false);

    // Reset when modal opens
    useEffect(() => {
        if (open && phase === 'idle' && !started.current) {
            started.current = true;
            runFlow();
        }
        if (!open) {
            started.current = false;
            setPhase('idle');
            setStepStates(['pending', 'pending', 'pending', 'pending']);
            setErrorMsg('');
        }
    }, [open]);

    const setStep = (idx: number, state: StepState) => {
        setStepStates(prev => prev.map((s, i) => i === idx ? state : s));
    };

    const runFlow = async () => {
        setPhase('signing');

        // Animate steps 0-2 (cert, PIN, sign) with delays — these happen in Windows,
        // so we simulate timing. Step 3 (CEZIH) completes when the actual API returns.
        setStep(0, 'active');
        await delay(600);
        setStep(0, 'done');
        setStep(1, 'active');
        await delay(700);
        setStep(1, 'done');
        setStep(2, 'active');
        await delay(500);
        setStep(2, 'done');
        setStep(3, 'active');

        try {
            const result = await signingFn();
            if (result.success) {
                setStep(3, 'done');
                setPhase('success');
                // Auto-close after 1.6s
                setTimeout(() => onDone(true), 1600);
            } else {
                setStep(3, 'error');
                setErrorMsg(result.error || 'Nepoznata greška');
                setPhase('error');
            }
        } catch (err: any) {
            setStep(3, 'error');
            setErrorMsg(err.message || 'Greška komunikacije');
            setPhase('error');
        }
    };

    const handleRetry = () => {
        started.current = false;
        setPhase('idle');
        setStepStates(['pending', 'pending', 'pending', 'pending']);
        setErrorMsg('');
        // Brief delay then start again
        setTimeout(() => {
            started.current = true;
            runFlow();
        }, 50);
    };

    if (!open) return null;

    return (
        <div
            style={{
                position: 'fixed', inset: 0, zIndex: 9999,
                background: 'rgba(6, 10, 22, 0.88)',
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: 16,
                animation: 'iden-fade-in 0.2s ease',
            }}
        >
            <style>{`
                @keyframes iden-fade-in { from { opacity: 0; } to { opacity: 1; } }
                @keyframes iden-slide-up { from { opacity: 0; transform: translateY(22px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
                @keyframes iden-spin { to { transform: rotate(360deg); } }
                @keyframes iden-led { 0%,100% { opacity:1; } 50% { opacity:0.3; } }
                @keyframes iden-pulse-green { 0%,100% { box-shadow: 0 0 0 0 rgba(74,222,128,0.4); } 50% { box-shadow: 0 0 0 8px rgba(74,222,128,0); } }
            `}</style>

            <div style={{
                width: '100%', maxWidth: 400,
                background: 'rgba(255,255,255,0.045)',
                backdropFilter: 'blur(28px)',
                WebkitBackdropFilter: 'blur(28px)',
                border: '1px solid rgba(255,255,255,0.10)',
                borderRadius: 24,
                boxShadow: '0 40px 100px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04) inset',
                overflow: 'hidden',
                color: '#fff',
                animation: 'iden-slide-up 0.32s cubic-bezier(0.22, 0.68, 0, 1.2)',
            }}>
                <div style={{ padding: '28px 26px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>

                    {/* Header */}
                    <div style={{
                        width: 44, height: 44, borderRadius: 14,
                        background: 'linear-gradient(135deg, #0ea5e9, #14b8a6)',
                        boxShadow: '0 4px 12px rgba(20,184,166,0.3)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        marginBottom: 14,
                    }}>
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                            <rect x="3" y="5" width="18" height="14" rx="2" stroke="white" strokeWidth="1.8" />
                            <rect x="7" y="9" width="6" height="4" rx="1" fill="white" opacity="0.6" />
                            <circle cx="17" cy="11" r="2" fill="white" opacity="0.5" />
                        </svg>
                    </div>

                    <div style={{ fontSize: 16, fontWeight: 800, color: '#fff', marginBottom: 4, textAlign: 'center' }}>
                        Potpisivanje IDEN certifikatom
                    </div>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', textAlign: 'center', marginBottom: 18, lineHeight: 1.55 }}>
                        <strong style={{ color: 'rgba(255,255,255,0.7)' }}>{actionLabel}</strong>
                    </div>

                    {/* Smart Card Visual */}
                    <SmartCardMock />

                    {/* Steps */}
                    {phase !== 'success' && (
                        <div style={{ width: '100%', maxWidth: 310, display: 'flex', flexDirection: 'column', gap: 6, marginTop: 16 }}>
                            {IDEN_STEPS.map((step, idx) => (
                                <StepRow key={step.key} label={step.label} sub={step.sub} state={stepStates[idx]} />
                            ))}
                        </div>
                    )}

                    {/* Success */}
                    {phase === 'success' && (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginTop: 16 }}>
                            <div style={{
                                width: 72, height: 72, borderRadius: '50%',
                                background: 'rgba(74,222,128,0.12)',
                                border: '1px solid rgba(74,222,128,0.3)',
                                boxShadow: '0 0 40px rgba(74,222,128,0.2)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                animation: 'iden-pulse-green 1.5s ease-in-out infinite',
                            }}>
                                <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                                    <path d="M5 13l4 4L19 7" stroke="#4ade80" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                            </div>
                            <div style={{ fontSize: 15, fontWeight: 800, color: '#4ade80' }}>Uspješno potpisano!</div>
                            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Zatvaranje modala…</div>
                        </div>
                    )}

                    {/* Error */}
                    {phase === 'error' && (
                        <div style={{ width: '100%', maxWidth: 310, marginTop: 16 }}>
                            <div style={{
                                background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
                                borderRadius: 10, padding: '10px 14px', marginBottom: 10,
                            }}>
                                <div style={{ fontSize: 12, color: '#fca5a5', fontWeight: 600 }}>Greška potpisivanja</div>
                                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 3 }}>{errorMsg}</div>
                            </div>
                            <button
                                onClick={handleRetry}
                                style={{
                                    width: '100%', padding: '10px', border: 'none', borderRadius: 10,
                                    cursor: 'pointer', fontSize: 13, fontWeight: 700, color: '#fff',
                                    background: 'rgba(99,102,241,0.7)', marginBottom: 6,
                                }}
                            >
                                Pokušaj ponovo
                            </button>
                            {onCancel && (
                                <button
                                    onClick={() => { onCancel(); }}
                                    style={{
                                        width: '100%', padding: '9px', border: '1px solid rgba(255,255,255,0.1)',
                                        borderRadius: 10, cursor: 'pointer', fontSize: 12, fontWeight: 600,
                                        color: 'rgba(255,255,255,0.4)', background: 'transparent',
                                    }}
                                >
                                    Odustani
                                </button>
                            )}
                        </div>
                    )}

                    {/* Cancel link while idle/signing */}
                    {(phase === 'idle' || phase === 'signing') && onCancel && (
                        <button
                            onClick={onCancel}
                            style={{
                                marginTop: 16, background: 'none', border: 'none', cursor: 'pointer',
                                fontSize: 11, color: 'rgba(255,255,255,0.2)', fontFamily: 'inherit',
                            }}
                        >
                            Odustani
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

// ── Smart Card Visual ──────────────────────────────────────────────────────
function SmartCardMock() {
    return (
        <div style={{
            width: 200, height: 130, borderRadius: 12,
            background: 'linear-gradient(135deg, #0c1a2e, #0f2944)',
            border: '1px solid rgba(14,165,233,0.35)',
            boxShadow: '0 0 30px rgba(14,165,233,0.2), 0 16px 40px rgba(0,0,0,0.5)',
            position: 'relative', overflow: 'hidden', margin: '4px auto',
            flexShrink: 0,
        }}>
            {/* Chip */}
            <div style={{
                position: 'absolute', top: 24, left: 18,
                width: 34, height: 26, borderRadius: 4,
                background: 'linear-gradient(135deg, #d4af37, #b8972b)',
                border: '1px solid rgba(255,200,50,0.3)',
                display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr',
                gap: 1, padding: 3,
            }}>
                {[0, 1, 2, 3].map(i => (
                    <div key={i} style={{ background: 'rgba(0,0,0,0.25)', borderRadius: 1 }} />
                ))}
            </div>
            {/* HR flag */}
            <div style={{
                position: 'absolute', top: 24, right: 16,
                width: 26, height: 20, borderRadius: 2,
                display: 'flex', overflow: 'hidden',
            }}>
                <div style={{ flex: 1, background: '#002395' }} />
                <div style={{ flex: 1, background: '#fff' }} />
                <div style={{ flex: 1, background: '#ED2939' }} />
            </div>
            {/* LED */}
            <div style={{
                position: 'absolute', bottom: 12, right: 14,
                width: 8, height: 8, borderRadius: '50%',
                background: '#22c55e',
                animation: 'iden-led 1.2s ease-in-out infinite',
                boxShadow: '0 0 6px rgba(34,197,94,0.7)',
            }} />
            {/* Text */}
            <div style={{
                position: 'absolute', bottom: 10, left: 14,
                fontSize: 7, fontWeight: 800, color: 'rgba(255,255,255,0.35)',
                letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: 'monospace',
            }}>
                IDEN · Certilia
            </div>
            {/* Shine */}
            <div style={{
                position: 'absolute', inset: 0,
                background: 'linear-gradient(135deg, rgba(255,255,255,0.04) 0%, transparent 50%)',
                pointerEvents: 'none',
            }} />
        </div>
    );
}

// ── Step Row ───────────────────────────────────────────────────────────────
function StepRow({ label, sub, state }: { label: string; sub: string; state: StepState }) {
    const colors: Record<StepState, { bg: string; border: string; text: string }> = {
        pending: { bg: 'rgba(255,255,255,0.02)', border: 'rgba(255,255,255,0.07)', text: 'rgba(255,255,255,0.25)' },
        active: { bg: 'rgba(99,102,241,0.10)', border: 'rgba(99,102,241,0.25)', text: '#a5b4fc' },
        done: { bg: 'rgba(74,222,128,0.08)', border: 'rgba(74,222,128,0.15)', text: '#4ade80' },
        error: { bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.2)', text: '#fca5a5' },
    };
    const c = colors[state];

    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '7px 11px', borderRadius: 10,
            background: c.bg, border: `1px solid ${c.border}`,
            transition: 'all 0.4s',
        }}>
            <div style={{ width: 16, height: 16, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {state === 'done' && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                        <path d="M5 13l4 4L19 7" stroke="#4ade80" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                )}
                {state === 'active' && (
                    <div style={{
                        width: 14, height: 14, borderRadius: '50%',
                        border: '2px solid rgba(99,102,241,0.3)',
                        borderTopColor: '#818cf8',
                        animation: 'iden-spin 1s linear infinite',
                    }} />
                )}
                {state === 'error' && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                        <path d="M6 18L18 6M6 6l12 12" stroke="#fca5a5" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                )}
                {state === 'pending' && (
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'rgba(255,255,255,0.15)' }} />
                )}
            </div>
            <div>
                <div style={{ fontSize: 12, fontWeight: state === 'active' ? 700 : 600, color: c.text }}>{label}</div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 1 }}>{sub}</div>
            </div>
        </div>
    );
}

function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}
