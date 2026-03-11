'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
    User, Activity, FileText, Send, Save, XCircle, CheckCircle,
    AlertTriangle, Clock, Calendar, ArrowLeft, ArrowRight, Info, Eye, Code,
    ChevronDown, ChevronRight, CheckCircle2, ShieldCheck, Shield, Database,
    ArrowUpRight, ArrowDownLeft, ClipboardList,
    Smartphone, Loader2, SmartphoneNfc, Bell, Wifi
} from 'lucide-react';
import { useToast, Toast } from '@/components/Toast';
import IdenSigningModal from '@/components/IdenSigningModal';

// ── Circular SVG countdown timer (same as login page) ─────────────────────────
function CircleTimer({ seconds }: { seconds: number }) {
    const r = 54;
    const circumference = 2 * Math.PI * r;
    const total = 120;
    const pct = Math.max(0, Math.min(seconds / total, 1));
    const dashOffset = circumference * (1 - pct);
    const mm = String(Math.floor(seconds / 60)).padStart(1, '0');
    const ss = String(seconds % 60).padStart(2, '0');

    return (
        <div className="relative flex items-center justify-center" style={{ width: 128, height: 128 }}>
            <svg width="128" height="128" style={{ transform: 'rotate(-90deg)' }}>
                <circle cx="64" cy="64" r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="10" />
                <circle
                    cx="64" cy="64" r={r}
                    fill="none"
                    stroke="url(#timerGradSign)"
                    strokeWidth="10"
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={dashOffset}
                    style={{ transition: 'stroke-dashoffset 1s linear' }}
                />
                <defs>
                    <linearGradient id="timerGradSign" x1="0%" y1="0%" x2="100%" y2="0%">
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

// ── Animated phone mock showing Certilia push screen (same as login page) ─────
function CertiliaPhoneMock({ seconds, label }: { seconds: number; label?: string }) {
    return (
        <div className="relative flex items-center justify-center" style={{ width: 200, height: 340 }}>
            {[0, 1, 2].map(i => (
                <div
                    key={i}
                    className="absolute rounded-full border border-indigo-400/20"
                    style={{
                        width: 180 + i * 44,
                        height: 300 + i * 44,
                        animation: `sign-phone-pulse 2.4s ease-out ${i * 0.6}s infinite`,
                    }}
                />
            ))}
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
                <div style={{ width: 48, height: 8, background: '#0f172a', borderRadius: 4, marginTop: 12 }} />
                <div style={{ width: '100%', padding: '4px 14px 2px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)', fontFamily: 'monospace' }}>9:41</span>
                    <Wifi style={{ width: 9, height: 9, color: 'rgba(255,255,255,0.4)' }} />
                </div>
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
                    <div style={{
                        marginLeft: 'auto',
                        width: 16, height: 16, borderRadius: 8,
                        background: '#ef4444',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        animation: 'sign-badge-bounce 1.2s ease-in-out infinite',
                    }}>
                        <span style={{ fontSize: 9, color: '#fff', fontWeight: 700 }}>1</span>
                    </div>
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '10px 12px 8px', width: '100%' }}>
                    <div style={{
                        width: '100%',
                        background: 'rgba(255,255,255,0.06)',
                        border: '1px solid rgba(255,255,255,0.12)',
                        borderRadius: 12,
                        padding: '10px 10px 8px',
                        textAlign: 'center',
                        marginBottom: 10,
                    }}>
                        <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>ZAHTJEV ZA POTPIS</div>
                        <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.7)', marginBottom: 8 }}>{label || 'Medicinski nalaz'}</div>
                        <div style={{ display: 'flex', justifyContent: 'center' }}>
                            <CircleTimer seconds={seconds} />
                        </div>
                    </div>
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
            <div style={{ position: 'absolute', top: 10, right: -8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {[0, 1, 2].map(i => (
                    <div key={i} style={{
                        width: 5, height: 5, borderRadius: '50%',
                        background: '#14b8a6',
                        opacity: 0.6,
                        animation: `sign-dot-blink 1.5s ease-in-out ${i * 0.3}s infinite`,
                    }} />
                ))}
            </div>
        </div>
    );
}

// ── Smart card reader image scene (same as login page) ──────────────────────
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
                        animation: `sign-sc-reader-pulse 2.4s ease-out ${i * 0.6}s infinite`,
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
                            animation: phase < 3 ? 'sign-sc-led-blink 1.2s ease-in-out infinite' : 'none',
                        }} />
                    )}
                </div>
            </div>
        </div>
    );
}

function ClinicalWorkspace() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const { toast, showToast, hideToast } = useToast();
    const patientId = searchParams.get('patientId');
    const mbo = searchParams.get('mbo');
    const patientMbo = searchParams.get('patientMbo');
    const caseIdParam = searchParams.get('caseId');
    const cezihCaseIdParam = searchParams.get('cezihCaseId'); // TC15-fetched external case ID
    const mkbParam = searchParams.get('mkb');
    const mkbDisplayParam = searchParams.get('mkbDisplay');

    // Final effective identifiers
    const effectiveMbo = patientMbo || mbo;

    const [visitStatus, setVisitStatus] = useState<'idle' | 'active' | 'finished'>('idle');
    const [visitId, setVisitId] = useState<string | null>(null);
    const [cezihVisitId, setCezihVisitId] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    // Structured Findings State
    const [anamnesis, setAnamnesis] = useState('');
    const [physicalStatus, setPhysicalStatus] = useState('');
    const [findingText, setFindingText] = useState('');
    const [recommendation, setRecommendation] = useState('');
    const [visitReasonCode, setVisitReasonCode] = useState(mkbParam || '');
    const [visitReasonDisplay, setVisitReasonDisplay] = useState(mkbDisplayParam || '');

    // Diagnosis (clinical document) — prefill from case MKB
    const [diagnosisCode, setDiagnosisCode] = useState(mkbParam || '');
    const [diagnosisDisplay, setDiagnosisDisplay] = useState(mkbDisplayParam || '');
    const [diagSuggestions, setDiagSuggestions] = useState<any[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);

    const [startDate, setStartDate] = useState<string>('');
    const [docType, setDocType] = useState<'011' | '012' | '013'>('011');
    const [logs, setLogs] = useState<any[]>([]);
    const [visitType, setVisitType] = useState<'AMB' | 'IMP' | 'EMER'>('AMB');

    // Case selector (TC 15-17)
    const [patientCases, setPatientCases] = useState<any[]>([]);
    const [selectedCaseId, setSelectedCaseId] = useState<string>(caseIdParam || '');

    // Audit Inspection
    const [isInspectorOpen, setIsInspectorOpen] = useState(false);
    const [inspectionLog, setInspectionLog] = useState<any>(null);
    const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

    // Signing Flow State
    const [isSigningModalOpen, setIsSigningModalOpen] = useState(false);
    const [signingStatus, setSigningStatus] = useState<'method-select' | 'waiting' | 'sc-waiting' | 'signed' | 'submitting' | 'success' | 'error'>('method-select');
    const [signingMethod, setSigningMethod] = useState<'certilia' | 'smartcard' | null>(null);
    const [signingError, setSigningError] = useState<string | null>(null);
    const [transactionCode, setTransactionCode] = useState<string | null>(null);
    const [currentDocOid, setCurrentDocOid] = useState<string | null>(null);

    // IDEN Modal State (TC12, TC13, TC14)
    const [idenModalOpen, setIdenModalOpen] = useState(false);
    const [idenModalLabel, setIdenModalLabel] = useState('');
    const [idenModalFn, setIdenModalFn] = useState<(() => Promise<{ success: boolean; error?: string }>) | null>(null);

    const openIdenModal = (label: string, fn: () => Promise<{ success: boolean; error?: string }>) => {
        setIdenModalLabel(label);
        setIdenModalFn(() => fn);
        setIdenModalOpen(true);
    };

    // TC18 Stepper Flow State
    const [isStepperOpen, setIsStepperOpen] = useState(false);
    const [stepperPhase, setStepperPhase] = useState<'idle' | 'tc16' | 'indexing' | 'signing' | 'submitting' | 'done' | 'error'>('idle');
    const [stepperError, setStepperError] = useState<string | null>(null);
    const [stepperResult, setStepperResult] = useState<any>(null);

    // Smart card signing phase (0=waiting, 1=cert, 2=pin, 3=done)
    const [scSignPhase, setScSignPhase] = useState(0);

    // Countdown for signing waiting screen (2 minutes = 120 seconds)
    const [signingCountdown, setSigningCountdown] = useState(120);
    const signingCountdownRef = useRef<NodeJS.Timeout | null>(null);

    // Start/stop countdown when signing modal opens/closes
    useEffect(() => {
        if (isSigningModalOpen && signingStatus === 'waiting') {
            setSigningCountdown(120);
            signingCountdownRef.current = setInterval(() => {
                setSigningCountdown(c => {
                    if (c <= 1) {
                        clearInterval(signingCountdownRef.current!);
                        return 0;
                    }
                    return c - 1;
                });
            }, 1000);
        } else {
            if (signingCountdownRef.current) clearInterval(signingCountdownRef.current);
        }
        return () => { if (signingCountdownRef.current) clearInterval(signingCountdownRef.current); };
    }, [isSigningModalOpen, signingStatus]);

    useEffect(() => {
        // Fetch initial suggestions (top 15)
        fetch('/api/terminology/diagnoses?q=')
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    setDiagSuggestions(data.results.slice(0, 15));
                }
            });

        // Set default date to now, formatted for datetime-local input (YYYY-MM-DDTHH:mm)
        const now = new Date();
        now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
        setStartDate(now.toISOString().slice(0, 16));

        // Fetch active cases for this patient (TC 15)
        if (effectiveMbo) {
            refreshCases();
        }
    }, []);

    const refreshCases = async (force: boolean = false) => {
        if (!effectiveMbo) return;
        try {
            const res = await fetch(`/api/case/patient/${effectiveMbo}${force ? '?refresh=true' : ''}`);
            const data = await res.json();
            if (data.success) {
                setPatientCases(data.cases.filter((c: any) => c.status === 'active'));
            }
        } catch (err) {
            console.error('Failed to load cases', err);
        }
    };

    // Poll for audit logs when visit is active — stop when finished
    useEffect(() => {
        if (!visitId || visitStatus === 'finished') return;

        const interval = setInterval(async () => {
            try {
                const res = await fetch(`/api/audit/logs/${visitId}`);
                const data = await res.json();
                if (data.success) {
                    setLogs(data.logs);
                }
            } catch (err) {
                // Silently suppress poll errors (server may be briefly unavailable)
            }
        }, 3000);

        return () => clearInterval(interval);
    }, [visitId, visitStatus]);

    const searchDiagnoses = async (q: string) => {
        try {
            const res = await fetch(`/api/terminology/diagnoses?q=${encodeURIComponent(q)}`);
            const data = await res.json();
            if (data.success) setDiagSuggestions(data.results);
        } catch (err) {
            console.error('Search failed', err);
        }
    };

    const handleDiagnosisSelect = (diag: any) => {
        setDiagnosisCode(diag.code);
        setDiagnosisDisplay(diag.display);
        setShowSuggestions(false);
    };

    const addLog = (msg: string) => { }; // Legacy no-op, we use database-backed Audit Logs

    // TC 12: Create Visit — opens IDEN modal
    const startVisit = async () => {
        openIdenModal('Otvaranje posjete (TC 12)', async () => {
            const res = await fetch('/api/visit/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    patientMbo: effectiveMbo,
                    practitionerId: '4981825',
                    organizationId: '999001425',
                    startDate: new Date(startDate).toISOString(),
                    class: visitType,
                    caseId: selectedCaseId || undefined,
                    cezihCaseId: cezihCaseIdParam || undefined,
                    reasonCode: visitReasonCode || undefined,
                    reasonDisplay: visitReasonDisplay || undefined,
                })
            });
            const data = await res.json();
            if (data.success) {
                const localId = data.result?.localVisitId || 'fallback-id';
                const cezihId = data.result?.cezihVisitId;
                setVisitId(localId);
                setCezihVisitId(cezihId || localId);
                setVisitStatus('active');
                return { success: true };
            }
            return { success: false, error: data.error };
        });
    };

    // TC 18: Full Send Flow — Stepper (TC16 → wait → sign → submit)
    const startSendFlow = async () => {
        if (!anamnesis?.trim()) {
            showToast('error', 'Anamneza je obavezno polje.');
            return;
        }
        if (!diagnosisCode) {
            showToast('error', 'Molimo odaberite primarnu dijagnozu (MKB-10).');
            return;
        }

        setIsStepperOpen(true);
        setStepperPhase('tc16');
        setStepperError(null);
        setStepperResult(null);

        let condFhirId = selectedCaseId || '';

        // Step 1: TC16 — Create case if not selected
        if (!condFhirId) {
            try {
                const caseRes = await fetch('/api/case/create', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        patientMbo: effectiveMbo,
                        title: `Slučaj: ${diagnosisDisplay || diagnosisCode}`,
                        diagnosisCode,
                        diagnosisDisplay,
                        practitionerId: '4981825',
                        organizationId: '999001425',
                        startDate: new Date().toISOString(),
                    })
                });
                const caseData = await caseRes.json();
                const caseResult = caseData.result || caseData;
                if (caseData.success && (caseResult.cezihCaseId || caseResult.localCaseId)) {
                    condFhirId = caseResult.cezihCaseId || caseResult.localCaseId;
                    console.log('[TC18 Flow] TC16 case created:', condFhirId);
                } else {
                    throw new Error(caseData.error || 'TC16 nije vratio ID slučaja');
                }
            } catch (err: any) {
                setStepperPhase('error');
                setStepperError(`TC16 greška: ${err.message}`);
                return;
            }
        }

        // Step 2: Wait for CEZIH indexing (5 seconds)
        setStepperPhase('indexing');
        await new Promise(resolve => setTimeout(resolve, 5000));

        // Step 3: Sign + Build MHD + Submit to CEZIH
        setStepperPhase('signing');
        try {
            const sendRes = await fetch('/api/document/send-full', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    patientMbo: effectiveMbo,
                    encCezihId: cezihVisitId || visitId,
                    condFhirId,
                    diagnosisCode,
                    diagnosisDisplay,
                    anamnesis,
                    finding: findingText,
                    status: physicalStatus,
                    recommendation,
                    type: docType,
                })
            });
            const sendData = await sendRes.json();

            if (sendData.success) {
                setStepperPhase('done');
                setStepperResult(sendData);
                setCurrentDocOid(sendData.documentOid);
                showToast('success', `Dokument uspješno poslan! OID: ${sendData.documentOid}`);
            } else {
                setStepperPhase('error');
                setStepperError(sendData.error || 'CEZIH je odbio dokument');
            }
        } catch (err: any) {
            setStepperPhase('error');
            setStepperError(`Greška: ${err.message}`);
        }
    };

    const startPolling = async (tCode: string, docOid: string) => {
        let attempts = 0;
        const maxAttempts = 120; // 5 minutes (2.5s interval)
        const pollInterval = 2500;

        const interval = setInterval(async () => {
            attempts++;
            if (attempts > maxAttempts) {
                clearInterval(interval);
                setSigningStatus('error');
                setSigningError('Isteklo vrijeme za potpisivanje (timeout).');
                return;
            }

            try {
                const res = await fetch(`/api/document/remote-sign/status/${tCode}`);
                const data = await res.json();

                if (data.success && data.isSigned) {
                    clearInterval(interval);
                    setSigningStatus('signed');
                    completeSubmission(tCode, docOid);
                }
            } catch (err) {
                console.warn('Polling error:', err);
            }
        }, pollInterval);
    };

    const completeSubmission = async (tCode: string, docOid: string) => {
        setSigningStatus('submitting');
        try {
            const res = await fetch('/api/document/send/complete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    transactionCode: tCode,
                    documentOid: docOid
                })
            });
            const data = await res.json();

            if (data.success) {
                setSigningStatus('success');
                addLog(`Uspješno potpisano i poslano na CEZIH! OID: ${docOid}`);
            } else {
                setSigningStatus('error');
                setSigningError(data.error || 'Greška pri dovršavanju slanja.');
            }
        } catch (err: any) {
            setSigningStatus('error');
            setSigningError(err.message);
        }
    };

    // Handler: user selects signing method
    const selectSigningMethod = async (method: 'certilia' | 'smartcard') => {
        setSigningMethod(method);
        if (method === 'certilia') {
            setSigningStatus('waiting');
            // Initiate Certilia remote signing on the backend
            if (currentDocOid) {
                try {
                    const res = await fetch('/api/document/certilia-sign', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ documentOid: currentDocOid }),
                    });
                    const data = await res.json();
                    if (data.success && data.transactionCode) {
                        setTransactionCode(data.transactionCode);
                        startPolling(data.transactionCode, currentDocOid);
                    } else {
                        setSigningStatus('error');
                        setSigningError(data.error || 'Greška pri pokretanju Certilia potpisa.');
                    }
                } catch (err: any) {
                    setSigningStatus('error');
                    setSigningError(err.message || 'Greška komunikacije s poslužiteljem.');
                }
            }
        } else {
            // Smart card flow
            setScSignPhase(0);
            setSigningStatus('sc-waiting');
            setTimeout(() => setScSignPhase(1), 800);
            // Start smart card signing on backend
            startSmartCardSigning();
        }
    };

    const startSmartCardSigning = async () => {
        if (!transactionCode || !currentDocOid) return;
        try {
            const res = await fetch('/api/document/smartcard-sign', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    transactionCode,
                    documentOid: currentDocOid,
                }),
            });
            const data = await res.json();
            if (data.success) {
                setScSignPhase(3);
                setSigningStatus('signed');
                completeSubmission(transactionCode, currentDocOid);
            } else {
                setSigningStatus('error');
                setSigningError(data.error || 'Greška pri potpisu pametnom karticom.');
            }
        } catch (err: any) {
            setSigningStatus('error');
            setSigningError(err.message || 'Greška komunikacije s poslužiteljem.');
        }
    };

    // TC 14: Close Visit — opens IDEN modal
    const closeVisit = async () => {
        if (!confirm('Jeste li sigurni da želite završiti posjet?')) return;
        openIdenModal('Zatvaranje posjete (TC 14)', async () => {
            const res = await fetch(`/api/visit/${visitId}/close`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ endDate: new Date().toISOString() })
            });
            const data = await res.json();
            if (data.success) {
                setVisitStatus('finished');
                return { success: true };
            }
            return { success: false, error: data.error };
        });
    };

    // TC 13: Update Visit — opens IDEN modal
    const updateVisit = async () => {
        if (!visitId) return;
        openIdenModal('Izmjena posjete (TC 13)', async () => {
            const res = await fetch(`/api/visit/${visitId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    diagnosisCode: 'Z00.0',
                    diagnosisDisplay: 'Opći medicinski pregled',
                })
            });
            const data = await res.json();
            if (data.success) return { success: true };
            return { success: false, error: data.error };
        });
    };

    return (
        <div className="space-y-6">
            <Toast toast={toast} onClose={hideToast} />
            {/* IDEN Signing Modal — TC12, TC13, TC14 */}
            <IdenSigningModal
                open={idenModalOpen}
                actionLabel={idenModalLabel}
                signingFn={idenModalFn || (() => Promise.resolve({ success: false }))}
                onDone={(success) => {
                    setIdenModalOpen(false);
                    if (success) showToast('success', `${idenModalLabel} — uspješno potpisano!`);
                    else showToast('error', `${idenModalLabel} — potpisivanje nije uspjelo.`);
                }}
                onCancel={() => setIdenModalOpen(false)}
            />
            {/* Header */}
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <button onClick={() => router.back()} className="p-2 hover:bg-slate-100 rounded-lg">
                        <ArrowLeft className="w-5 h-5 text-slate-500" />
                    </button>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-800">Radni prostor liječnika</h1>
                        <div className="flex items-center gap-2 text-sm text-slate-500">
                            <User className="w-4 h-4" /> Pacijent MBO: <span className="font-mono font-medium text-slate-700">{effectiveMbo || 'Nepoznato'}</span>
                        </div>
                    </div>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-3">
                    {visitStatus === 'idle' && (
                        <>

                            <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-lg border border-slate-200">
                                <Activity className="w-4 h-4 text-slate-400" />
                                <select
                                    value={visitType}
                                    onChange={(e) => setVisitType(e.target.value as any)}
                                    className="text-sm text-slate-700 outline-none bg-transparent font-medium"
                                >
                                    <option value="AMB">Izvješće nakon pregleda u ambulanti privatne zdravstvene ustanove</option>
                                    <option value="IMP">Nalazi iz specijalističke ordinacije privatne zdravstvene ustanove</option>
                                    <option value="EMER">Otpusno pismo iz privatne zdravstvene ustanove</option>
                                </select>
                            </div>
                            {/* Case selector (TC 15-17) */}
                            <div className="flex items-center gap-2 bg-white px-3 py-2 rounded-lg border border-slate-200">
                                <ClipboardList className="w-4 h-4 text-amber-500" />
                                {cezihCaseIdParam ? (
                                    /* CEZIH case — show read-only badge instead of dropdown */
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200">🌐 CEZIH</span>
                                        <span className="text-sm text-slate-700 font-medium">
                                            {mkbParam && <span className="font-black text-slate-900">{mkbParam}</span>}
                                            {mkbParam && mkbDisplayParam && ' — '}
                                            {mkbDisplayParam
                                                ? (mkbDisplayParam.length > 40 ? mkbDisplayParam.slice(0, 40) + '…' : mkbDisplayParam)
                                                : 'Vanjski CEZIH slučaj'}
                                        </span>
                                    </div>
                                ) : (
                                    /* Local case — standard dropdown */
                                    <div className="flex items-center gap-2">
                                        <select
                                            value={selectedCaseId}
                                            onChange={(e) => {
                                                const id = e.target.value;
                                                setSelectedCaseId(id);
                                                if (id) {
                                                    const c = patientCases.find((c: any) => c.id === id);
                                                    if (c) {
                                                        setDiagnosisCode(c.diagnosisCode || '');
                                                        setDiagnosisDisplay(c.diagnosisDisplay || c.title || '');
                                                    }
                                                } else {
                                                    setDiagnosisCode('');
                                                    setDiagnosisDisplay('');
                                                }
                                            }}
                                            className="text-sm text-slate-700 outline-none bg-transparent font-medium max-w-[150px]"
                                        >
                                            <option value="">Bez slučaja</option>
                                            {patientCases.map((c: any) => (
                                                <option key={c.id} value={c.id}>
                                                    {c.diagnosisCode ? `${c.diagnosisCode} — ` : ''}{c.title || c.diagnosisDisplay || 'Slučaj'}
                                                </option>
                                            ))}
                                        </select>
                                        <button
                                            onClick={() => refreshCases(true)}
                                            className="p-1 hover:bg-amber-50 rounded text-amber-600"
                                            title="Osvježi slučajeve s CEZIH-a"
                                        >
                                            <Database className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                )}
                            </div>

                            <button
                                onClick={startVisit}
                                disabled={loading}
                                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium transition-colors shadow-sm disabled:opacity-50"
                            >
                                <Activity className="w-4 h-4" />
                                {new Date(startDate) > new Date(Date.now() + 3600000) ? 'Planiraj posjet' : 'Započni posjet (TC 12)'}
                            </button>
                        </>
                    )}

                    {visitStatus === 'active' && (
                        <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-700 rounded-lg border border-emerald-100 font-medium">
                            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                            Posjet u tijeku
                        </div>
                    )}

                    {visitStatus === 'finished' && (
                        <div className="flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-500 rounded-lg font-medium">
                            <CheckCircle className="w-4 h-4" />
                            Posjet završen
                        </div>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Main Editor */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-[600px]">
                        <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                            <div className="font-semibold text-slate-700 flex items-center gap-2">
                                <FileText className="w-4 h-4" />
                                Klinički nalaz
                            </div>
                            <div className="text-xs text-slate-400">Autosave: Enabled</div>
                        </div>

                        <div className="flex-1 p-6 overflow-y-auto space-y-6 bg-white">
                            {/* Diagnosis Picker Section */}
                            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 relative">
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Primarna Dijagnoza (MKB-10)</label>
                                <div className="flex gap-2">
                                    <div className="relative w-32">
                                        <input
                                            type="text"
                                            placeholder="Kod"
                                            className="w-full px-3 py-2 border rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500 outline-none uppercase"
                                            value={diagnosisCode}
                                            onChange={(e) => {
                                                const val = e.target.value.toUpperCase();
                                                setDiagnosisCode(val);
                                                searchDiagnoses(val);
                                                setShowSuggestions(true);
                                            }}
                                            onFocus={() => {
                                                setShowSuggestions(true);
                                                if (diagSuggestions.length === 0) searchDiagnoses(diagnosisCode);
                                            }}
                                            disabled={visitStatus !== 'active' || loading}
                                        />
                                    </div>
                                    <div className="relative flex-1">
                                        <input
                                            type="text"
                                            placeholder="Pretraži po nazivu..."
                                            className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                            value={diagnosisDisplay}
                                            onChange={(e) => {
                                                setDiagnosisDisplay(e.target.value);
                                                searchDiagnoses(e.target.value);
                                                setShowSuggestions(true);
                                            }}
                                            onFocus={() => {
                                                setShowSuggestions(true);
                                                if (diagSuggestions.length === 0) searchDiagnoses(diagnosisDisplay);
                                            }}
                                            disabled={visitStatus !== 'active' || loading}
                                        />

                                        {showSuggestions && diagSuggestions.length > 0 && (
                                            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-xl z-50 max-h-60 overflow-y-auto">
                                                {diagSuggestions.map((d) => (
                                                    <button
                                                        key={d.code}
                                                        className="w-full text-left px-4 py-2 hover:bg-blue-50 transition-colors border-b border-slate-50 last:border-0"
                                                        onClick={() => handleDiagnosisSelect(d)}
                                                    >
                                                        <div className="flex justify-between items-center">
                                                            <span className="font-mono text-blue-600 font-bold text-xs">{d.code}</span>
                                                            <span className="text-xs text-slate-400">MKB-10</span>
                                                        </div>
                                                        <div className="text-sm text-slate-700 truncate">{d.display}</div>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                        {showSuggestions && diagSuggestions.length === 0 && diagnosisCode.length > 0 && (
                                            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-xl z-50 p-4 text-center text-xs text-slate-500 italic">
                                                Nema pronađenih dijagnoza.
                                            </div>
                                        )}
                                    </div>
                                    {showSuggestions && (
                                        <button
                                            onClick={() => setShowSuggestions(false)}
                                            className="p-2 text-slate-400 hover:text-slate-600"
                                        >
                                            <XCircle className="w-5 h-5" />
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Narrative Sections */}
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">1. Anamneza</label>
                                    <textarea
                                        className="w-full p-3 border rounded-lg text-sm resize-none outline-none focus:ring-2 focus:ring-blue-500 min-h-[80px]"
                                        placeholder="Povijest bolesti i sadašnje tegobe..."
                                        value={anamnesis}
                                        onChange={(e) => setAnamnesis(e.target.value)}
                                        disabled={visitStatus !== 'active' || loading}
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">2. Status</label>
                                    <textarea
                                        className="w-full p-3 border rounded-lg text-sm resize-none outline-none focus:ring-2 focus:ring-blue-500 min-h-[80px]"
                                        placeholder="Fizikalni nalaz..."
                                        value={physicalStatus}
                                        onChange={(e) => setPhysicalStatus(e.target.value)}
                                        disabled={visitStatus !== 'active' || loading}
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">3. Nalaz i Mišljenje</label>
                                    <textarea
                                        className="w-full p-3 border rounded-lg text-sm resize-none outline-none focus:ring-2 focus:ring-blue-500 min-h-[120px]"
                                        placeholder="Klinički zaključak..."
                                        value={findingText}
                                        onChange={(e) => setFindingText(e.target.value)}
                                        disabled={visitStatus !== 'active' || loading}
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">4. Preporuka i Terapija</label>
                                    <textarea
                                        className="w-full p-3 border rounded-lg text-sm resize-none outline-none focus:ring-2 focus:ring-blue-500 min-h-[80px]"
                                        placeholder="Plan liječenja i prepisana terapija..."
                                        value={recommendation}
                                        onChange={(e) => setRecommendation(e.target.value)}
                                        disabled={visitStatus !== 'active' || loading}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between gap-4">
                            <div className="flex flex-col gap-2">
                                <button
                                    onClick={() => startSendFlow()}
                                    disabled={visitStatus !== 'active' || loading}
                                    title={visitStatus !== 'active' ? 'Prvo morate započeti posjet klikom na gumb "Započni posjet"' : ''}
                                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <Send className="w-4 h-4" />
                                    Pošalji Medicinski Nalaz (TC 18)
                                </button>
                                {visitStatus === 'idle' && (
                                    <p className="text-[10px] text-amber-600 font-medium flex items-center gap-1">
                                        <Info className="w-3 h-3" />
                                        Započnite posjet kako biste aktivirali slanje
                                    </p>
                                )}
                            </div>

                            {visitStatus === 'active' && (
                                <div className="flex gap-2">
                                    <button
                                        onClick={updateVisit}
                                        disabled={loading}
                                        className="px-4 py-2 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
                                    >
                                        <Activity className="w-4 h-4" />
                                        Ažuriraj posjet (TC 13)
                                    </button>
                                    <button
                                        onClick={closeVisit}
                                        disabled={loading}
                                        className="px-4 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
                                    >
                                        <XCircle className="w-4 h-4" />
                                        Završi posjet (TC 14)
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Sidebar: Lifecycle & Logs */}
                <div className="space-y-6">
                    {/* Visit Lifecycle (Visual Timeline) */}
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                        <div className="p-4 border-b border-slate-100 bg-slate-50 font-bold text-slate-700 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Activity className="w-4 h-4 text-blue-600" />
                                Životni ciklus posjeta
                            </div>
                            <span className="text-[10px] text-slate-400 font-mono">#{visitId?.substring(0, 8) || '---'}</span>
                        </div>

                        <div className="p-6">
                            <div className="space-y-8 relative">
                                {/* Vertical Line Connection */}
                                <div className="absolute left-[15px] top-2 bottom-2 w-0.5 bg-slate-100" />

                                {/* Stage 1: Encounter Start */}
                                <div className="flex items-start gap-4 relative z-10">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${visitStatus !== 'idle' ? 'bg-emerald-500 border-emerald-500 text-white shadow-lg shadow-emerald-100' : 'bg-white border-slate-200 text-slate-300'}`}>
                                        <Clock className="w-4 h-4" />
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex items-center justify-between">
                                            <p className={`text-sm font-bold ${visitStatus !== 'idle' ? 'text-slate-900' : 'text-slate-400'}`}>U Obradi</p>
                                            {logs.find(l => l.action === 'ENCOUNTER_START') && (
                                                <button
                                                    onClick={() => { setInspectionLog(logs.find(l => l.action === 'ENCOUNTER_START')); setIsInspectorOpen(true); }}
                                                    className="p-1 hover:bg-blue-50 text-blue-600 rounded"
                                                >
                                                    <Info className="w-3.5 h-3.5" />
                                                </button>
                                            )}
                                        </div>
                                        <p className="text-[10px] text-slate-500">Započet postupak na CEZIH-u</p>
                                    </div>
                                </div>

                                {/* Stage 2: Findings Sent */}
                                <div className="flex items-start gap-4 relative z-10">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${logs.some(l => l.action === 'SEND_FINDING') ? 'bg-blue-500 border-blue-500 text-white shadow-lg shadow-blue-100' : 'bg-white border-slate-200 text-slate-300'}`}>
                                        <FileText className="w-4 h-4" />
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex items-center justify-between">
                                            <p className={`text-sm font-bold ${logs.some(l => l.action === 'SEND_FINDING') ? 'text-slate-900' : 'text-slate-400'}`}>Nalazi Poslani</p>
                                            {logs.filter(l => l.action === 'SEND_FINDING').length > 0 && (
                                                <div className="flex gap-1">
                                                    <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-bold">
                                                        {logs.filter(l => l.action === 'SEND_FINDING').length}
                                                    </span>
                                                    <button
                                                        onClick={() => { setInspectionLog(logs.find(l => l.action === 'SEND_FINDING')); setIsInspectorOpen(true); }}
                                                        className="p-1 hover:bg-blue-50 text-blue-600 rounded"
                                                    >
                                                        <Info className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                        <p className="text-[10px] text-slate-500">MHD ITI-65 arhivirano u repozitorij</p>
                                    </div>
                                </div>

                                {/* Stage 3: Realization (Close) */}
                                <div className="flex items-start gap-4 relative z-10">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${visitStatus === 'finished' ? 'bg-emerald-600 border-emerald-600 text-white shadow-lg shadow-emerald-100' : 'bg-white border-slate-200 text-slate-300'}`}>
                                        <CheckCircle2 className="w-4 h-4" />
                                    </div>
                                    <div className="flex-1">
                                        <div className="flex items-center justify-between">
                                            <p className={`text-sm font-bold ${visitStatus === 'finished' ? 'text-slate-900' : 'text-slate-400'}`}>Realizirana</p>
                                            {logs.find(l => l.action === 'REALIZATION') && (
                                                <button
                                                    onClick={() => { setInspectionLog(logs.find(l => l.action === 'REALIZATION')); setIsInspectorOpen(true); }}
                                                    className="p-1 hover:bg-blue-50 text-blue-600 rounded"
                                                >
                                                    <Info className="w-3.5 h-3.5" />
                                                </button>
                                            )}
                                        </div>
                                        <p className="text-[10px] text-slate-500">Posjet zatvoren i konačno proknjižen</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>



                    {/* Quick Info */}
                    <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 text-blue-800 text-sm">
                        <div className="flex items-center gap-2 font-semibold mb-2">
                            <ShieldCheck className="w-4 h-4" />
                            Status Sljedivosti
                        </div>
                        <p className="text-[11px] leading-relaxed">
                            Sve FHIR transakcije su digitalno potpisane i trajno arhivirane u lokalnom audit logu za potrebe certifikacije i kontrole kvalitete.
                        </p>
                    </div>
                </div>
            </div>

            {/* JSON Inspector Modal */}
            {isInspectorOpen && inspectionLog && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col border border-slate-200">
                        <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                            <div>
                                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2 uppercase tracking-tight">
                                    <Code className="w-5 h-5 text-blue-600" />
                                    FHIR Inspector: {inspectionLog.action}
                                </h3>
                                <p className="text-[10px] text-slate-400 font-mono">{inspectionLog.id}</p>
                            </div>
                            <button
                                onClick={() => setIsInspectorOpen(false)}
                                className="p-2 hover:bg-slate-200 rounded-full transition-colors"
                            >
                                <XCircle className="w-6 h-6 text-slate-400" />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50">
                            {/* Request */}
                            <div className="space-y-3">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                    <ArrowUpRight className="w-3 h-3" />
                                    FHIR Request (Outgoing)
                                </label>
                                <div className="bg-slate-900 rounded-xl p-4 h-[500px] overflow-auto shadow-inner">
                                    <pre className="text-[10px] font-mono text-blue-300">
                                        {inspectionLog.payload_req ? JSON.stringify(JSON.parse(inspectionLog.payload_req), null, 2) : '// Nema podataka'}
                                    </pre>
                                </div>
                            </div>

                            {/* Response */}
                            <div className="space-y-3">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                    <ArrowDownLeft className="w-3 h-3" />
                                    CEZIH Response (Incoming)
                                </label>
                                <div className={`bg-slate-900 rounded-xl p-4 h-[500px] overflow-auto shadow-inner ${inspectionLog.status === 'ERROR' ? 'border-2 border-rose-500/30' : ''}`}>
                                    <pre className={`text-[10px] font-mono ${inspectionLog.status === 'ERROR' ? 'text-rose-300' : 'text-emerald-300'}`}>
                                        {inspectionLog.payload_res ? JSON.stringify(JSON.parse(inspectionLog.payload_res), null, 2) : '// Čekam odgovor...'}
                                    </pre>
                                </div>
                            </div>
                        </div>

                        {inspectionLog.error_msg && (
                            <div className="p-4 bg-rose-600 text-white flex items-center gap-3">
                                <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                                <div className="text-sm">
                                    <span className="font-bold">Greška prijenosa: </span>
                                    {inspectionLog.error_msg}
                                </div>
                            </div>
                        )}

                        <div className="p-4 bg-white border-t border-slate-100 flex justify-end">
                            <button
                                onClick={() => setIsInspectorOpen(false)}
                                className="px-6 py-2 bg-slate-800 text-white rounded-lg text-sm font-bold hover:bg-slate-900 transition-colors"
                            >
                                Zatvori
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* TC18 Stepper Modal */}
            {isStepperOpen && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center p-4" style={{ background: 'rgba(10,15,30,0.88)', backdropFilter: 'blur(10px)' }}>
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
                        {/* Header */}
                        <div className="p-5 bg-gradient-to-r from-blue-600 to-indigo-700 text-white">
                            <h3 className="text-lg font-bold flex items-center gap-2">
                                <Send className="w-5 h-5" />
                                Slanje Medicinskog Nalaza
                            </h3>
                            <p className="text-sm text-blue-100 mt-1">TC16 → Indeksacija → Potpis → CEZIH</p>
                        </div>

                        {/* Stepper */}
                        <div className="p-5 space-y-4">
                            {[
                                { key: 'tc16', label: '1. Kreiranje slučaja (TC16)', sub: 'U sklopu posjete potrebno je kreirati medicinski slučaj za praćenje dijagnoze.', icon: '📋' },
                                { key: 'indexing', label: '2. CEZIH indeksacija', sub: 'Čekam da CEZIH indeksira slučaj...', icon: '⏳' },
                                { key: 'signing', label: '3. Potpis dokumenta', sub: 'Gradnja i potpis unutarnjeg bundlea (Sign token)', icon: '🔐' },
                                { key: 'done', label: '4. Slanje na CEZIH', sub: 'MHD ITI-65 submit', icon: '🚀' },
                            ].map((step, idx) => {
                                const phases = ['tc16', 'indexing', 'signing', 'done'];
                                const currentIdx = phases.indexOf(stepperPhase === 'error' ? phases[phases.length - 1] : stepperPhase);
                                const stepIdx = idx;
                                const isActive = phases[stepIdx] === stepperPhase;
                                const isDone = stepIdx < currentIdx || stepperPhase === 'done';
                                const isError = stepperPhase === 'error' && stepIdx === currentIdx;

                                return (
                                    <div key={step.key} className={`flex items-start gap-3 p-3 rounded-xl transition-all ${isActive ? 'bg-blue-50 border border-blue-200' : isDone ? 'bg-emerald-50 border border-emerald-100' : 'bg-slate-50 border border-slate-100'}`}>
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${isDone ? 'bg-emerald-500 text-white' : isActive ? 'bg-blue-500 text-white animate-pulse' : 'bg-slate-200 text-slate-400'}`}>
                                            {isDone ? '✓' : step.icon}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className={`text-sm font-semibold ${isDone ? 'text-emerald-700' : isActive ? 'text-blue-700' : 'text-slate-400'}`}>
                                                {step.label}
                                            </div>
                                            {(isActive || isDone) && (
                                                <div className={`text-xs mt-0.5 ${isDone ? 'text-emerald-500' : 'text-blue-500'}`}>
                                                    {isDone ? '✅ Gotovo' : step.sub}
                                                </div>
                                            )}
                                        </div>
                                        {isActive && !isDone && (
                                            <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin shrink-0 mt-1" />
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {/* Error display */}
                        {stepperPhase === 'error' && stepperError && (
                            <div className="mx-5 mb-4 p-3 bg-red-50 border border-red-200 rounded-xl">
                                <div className="text-sm font-semibold text-red-700 flex items-center gap-2">
                                    <XCircle className="w-4 h-4" /> Greška
                                </div>
                                <div className="text-xs text-red-600 mt-1 break-all">{stepperError}</div>
                            </div>
                        )}

                        {/* Success display */}
                        {stepperPhase === 'done' && stepperResult && (
                            <div className="mx-5 mb-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                                <div className="text-sm font-semibold text-emerald-700 flex items-center gap-2">
                                    <CheckCircle className="w-4 h-4" /> Dokument je uspješno poslan!
                                </div>
                                <div className="text-xs text-emerald-600 mt-1 font-mono">
                                    OID: {stepperResult.documentOid}
                                </div>
                            </div>
                        )}

                        {/* Footer */}
                        <div className="p-4 border-t flex justify-end">
                            {(stepperPhase === 'done' || stepperPhase === 'error') && (
                                <button
                                    onClick={() => {
                                        setIsStepperOpen(false);
                                        setStepperPhase('idle');
                                        if (stepperPhase === 'done') {
                                            router.push(`/dashboard/patients/${effectiveMbo}`);
                                        }
                                    }}
                                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium transition-colors"
                                >
                                    Zatvori
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Signing Modal */}
            {isSigningModalOpen && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4" style={{ background: 'rgba(10,15,30,0.85)', backdropFilter: 'blur(8px)' }}>
                    {/* CSS keyframes for phone & smart card animations */}
                    <style>{`
                        @keyframes sign-phone-pulse {
                            0%   { transform: scale(1);    opacity: 0.5; }
                            50%  { transform: scale(1.04); opacity: 0.25; }
                            100% { transform: scale(1.08); opacity: 0; }
                        }
                        @keyframes sign-badge-bounce {
                            0%, 100% { transform: scale(1); }
                            50%      { transform: scale(1.25); }
                        }
                        @keyframes sign-dot-blink {
                            0%, 100% { opacity: 0.2; }
                            50%      { opacity: 1; }
                        }
                        @keyframes sign-sc-reader-pulse {
                            0%   { transform: scale(1);    opacity: 0.5; }
                            50%  { transform: scale(1.05); opacity: 0.2; }
                            100% { transform: scale(1.1);  opacity: 0; }
                        }
                        @keyframes sign-sc-led-blink {
                            0%, 100% { opacity: 1; }
                            50%      { opacity: 0.4; }
                        }
                    `}</style>
                    <div style={{
                        width: '100%', maxWidth: 420,
                        background: 'rgba(255,255,255,0.04)',
                        backdropFilter: 'blur(24px)',
                        WebkitBackdropFilter: 'blur(24px)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: 24,
                        boxShadow: '0 32px 80px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.05) inset',
                        overflow: 'hidden',
                        fontFamily: "'Inter', 'Segoe UI', Arial, sans-serif",
                        animation: 'sign-slide-up 0.35s ease-out',
                    }}>
                        <style>{`@keyframes sign-slide-up { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }`}</style>
                        <div style={{ padding: '28px 28px 24px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                            {/* ── METHOD SELECT ── */}
                            {signingStatus === 'method-select' && (
                                <>
                                    <h3 style={{ fontSize: 17, fontWeight: 800, color: '#fff', margin: '0 0 4px' }}>
                                        Potpis dokumenta
                                    </h3>
                                    <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', textAlign: 'center', margin: '0 0 16px', maxWidth: 300 }}>
                                        Odaberite način potpisa
                                    </p>
                                    <div style={{ width: '100%', maxWidth: 340, display: 'flex', flexDirection: 'column', gap: 10 }}>
                                        {/* Certilia button */}
                                        <button
                                            onClick={() => selectSigningMethod('certilia')}
                                            style={{
                                                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                padding: '14px 16px',
                                                background: 'rgba(99,102,241,0.08)',
                                                border: '1px solid rgba(99,102,241,0.25)',
                                                borderRadius: 14, cursor: 'pointer', transition: 'all 0.2s',
                                                fontFamily: 'inherit', color: '#fff',
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
                                                <div style={{ fontSize: 14, fontWeight: 700 }}>Certilia mobile.id</div>
                                            </div>
                                            <ArrowRight style={{ width: 18, height: 18, color: 'rgba(255,255,255,0.25)' }} />
                                        </button>
                                        {/* Smart card button */}
                                        <button
                                            onClick={() => selectSigningMethod('smartcard')}
                                            style={{
                                                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                padding: '14px 16px',
                                                background: 'rgba(20,184,166,0.08)',
                                                border: '1px solid rgba(20,184,166,0.2)',
                                                borderRadius: 14, cursor: 'pointer', transition: 'all 0.2s',
                                                fontFamily: 'inherit', color: '#fff',
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
                                                <div style={{ fontSize: 14, fontWeight: 700 }}>Pametna kartica</div>
                                            </div>
                                            <ArrowRight style={{ width: 18, height: 18, color: 'rgba(255,255,255,0.25)' }} />
                                        </button>
                                    </div>
                                    <button
                                        onClick={() => setIsSigningModalOpen(false)}
                                        style={{
                                            marginTop: 16, background: 'none', border: 'none', cursor: 'pointer',
                                            fontSize: 12, color: 'rgba(255,255,255,0.25)',
                                            display: 'flex', alignItems: 'center', gap: 6, transition: 'color 0.2s',
                                            fontFamily: 'inherit',
                                        }}
                                        onMouseEnter={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.5)')}
                                        onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.25)')}
                                    >
                                        <ArrowLeft style={{ width: 14, height: 14 }} /> Odustani
                                    </button>
                                </>
                            )}

                            {/* ── CERTILIA WAITING ── */}
                            {signingStatus === 'waiting' && (
                                <>
                                    <h3 style={{ fontSize: 17, fontWeight: 800, color: '#fff', margin: '0 0 4px' }}>
                                        Odobrenje potpisa
                                    </h3>
                                    <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', textAlign: 'center', margin: '0 0 16px', maxWidth: 300 }}>
                                        Otvorite <strong style={{ color: 'rgba(255,255,255,0.65)' }}>Certilia</strong> aplikaciju i pritisnite <strong style={{ color: '#4ade80' }}>ODOBRI</strong>
                                    </p>
                                    <CertiliaPhoneMock seconds={signingCountdown} label="Medicinski nalaz" />
                                    <div style={{ width: '100%', maxWidth: 300, display: 'flex', flexDirection: 'column', gap: 6, marginTop: 16 }}>
                                        <div style={{
                                            display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                                            background: 'rgba(74,222,128,0.08)',
                                            border: '1px solid rgba(74,222,128,0.15)',
                                            borderRadius: 10,
                                        }}>
                                            <CheckCircle style={{ width: 16, height: 16, color: '#4ade80', flexShrink: 0 }} />
                                            <span style={{ fontSize: 12, color: '#4ade80' }}>Dokument generiran</span>
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
                                            <Loader2 style={{ width: 16, height: 16, color: '#818cf8', flexShrink: 0, animation: 'spin 1s linear infinite' }} />
                                            <span style={{ fontSize: 12, color: '#818cf8', fontWeight: 600 }}>Čeka se potpis...</span>
                                        </div>
                                    </div>
                                    <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'rgba(255,255,255,0.25)', fontFamily: 'monospace' }}>
                                        <ShieldCheck style={{ width: 12, height: 12 }} />
                                        TXN: {transactionCode}
                                    </div>
                                </>
                            )}

                            {/* ── SMART CARD WAITING ── */}
                            {signingStatus === 'sc-waiting' && (
                                <>
                                    <h3 style={{ fontSize: 17, fontWeight: 800, color: '#fff', margin: '0 0 4px' }}>Potpis pametnom karticom</h3>
                                    <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', textAlign: 'center', margin: '0 0 8px', maxWidth: 300 }}>
                                        Odaberite <strong style={{ color: 'rgba(255,255,255,0.65)' }}>certifikat</strong> i unesite <strong style={{ color: 'rgba(255,255,255,0.65)' }}>PIN</strong>
                                    </p>

                                    <SmartCardMock phase={scSignPhase} />

                                    {/* 4-step stepper */}
                                    <div style={{ width: '100%', maxWidth: 300, display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                                        {/* Step 1: Connected */}
                                        <div style={{
                                            display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                                            background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.15)', borderRadius: 10,
                                        }}>
                                            <CheckCircle style={{ width: 16, height: 16, color: '#4ade80', flexShrink: 0 }} />
                                            <span style={{ fontSize: 12, color: '#4ade80' }}>Povezivanje s CEZIH sustavom</span>
                                        </div>
                                        {/* Step 2: Select cert */}
                                        <div style={{
                                            display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                                            background: scSignPhase >= 3 ? 'rgba(74,222,128,0.08)' : 'rgba(99,102,241,0.1)',
                                            border: `1px solid ${scSignPhase >= 3 ? 'rgba(74,222,128,0.15)' : 'rgba(99,102,241,0.25)'}`,
                                            borderRadius: 10, transition: 'all 0.5s',
                                        }}>
                                            {scSignPhase >= 3
                                                ? <CheckCircle style={{ width: 16, height: 16, color: '#4ade80', flexShrink: 0 }} />
                                                : <Loader2 style={{ width: 16, height: 16, color: '#818cf8', flexShrink: 0, animation: 'spin 1s linear infinite' }} />
                                            }
                                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                                                <span style={{ fontSize: 12, color: scSignPhase >= 3 ? '#4ade80' : '#a5b4fc', fontWeight: 600 }}>Odabir certifikata</span>
                                                {scSignPhase < 3 && <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 1 }}>Odaberite certifikat u Chrome prozoru</span>}
                                            </div>
                                        </div>
                                        {/* Step 3: PIN */}
                                        <div style={{
                                            display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                                            background: scSignPhase >= 3 ? 'rgba(74,222,128,0.08)' : 'rgba(255,255,255,0.03)',
                                            border: `1px solid ${scSignPhase >= 3 ? 'rgba(74,222,128,0.15)' : 'rgba(255,255,255,0.08)'}`,
                                            borderRadius: 10, transition: 'all 0.5s',
                                        }}>
                                            {scSignPhase >= 3
                                                ? <CheckCircle style={{ width: 16, height: 16, color: '#4ade80', flexShrink: 0 }} />
                                                : <div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.15)', flexShrink: 0 }} />
                                            }
                                            <span style={{ fontSize: 12, color: scSignPhase >= 3 ? '#4ade80' : 'rgba(255,255,255,0.25)' }}>Unos PIN-a</span>
                                        </div>
                                        {/* Step 4: Sign */}
                                        <div style={{
                                            display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                                            background: scSignPhase >= 3 ? 'rgba(74,222,128,0.08)' : 'rgba(255,255,255,0.03)',
                                            border: `1px solid ${scSignPhase >= 3 ? 'rgba(74,222,128,0.15)' : 'rgba(255,255,255,0.08)'}`,
                                            borderRadius: 10, transition: 'all 0.5s',
                                        }}>
                                            {scSignPhase >= 3
                                                ? <CheckCircle style={{ width: 16, height: 16, color: '#4ade80', flexShrink: 0 }} />
                                                : <div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.15)', flexShrink: 0 }} />
                                            }
                                            <span style={{ fontSize: 12, color: scSignPhase >= 3 ? '#4ade80' : 'rgba(255,255,255,0.25)' }}>Potpis dokumenta</span>
                                        </div>
                                    </div>
                                </>
                            )}

                            {signingStatus === 'signed' && (
                                <>
                                    <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'rgba(74,222,128,0.15)', border: '1px solid rgba(74,222,128,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', boxShadow: '0 0 40px rgba(74,222,128,0.2)' }}>
                                        <CheckCircle2 style={{ width: 40, height: 40, color: '#4ade80' }} />
                                    </div>
                                    <h3 style={{ fontSize: 18, fontWeight: 800, color: '#4ade80', margin: '0 0 8px' }}>Uspješno potpisano!</h3>
                                    <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', margin: 0 }}>
                                        Dohvaćam potpisan dokument i šaljem ga na CEZIH...
                                    </p>
                                    <Loader2 style={{ width: 24, height: 24, color: '#4ade80', animation: 'spin 1s linear infinite', marginTop: 16 }} />
                                </>
                            )}

                            {signingStatus === 'submitting' && (
                                <>
                                    <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                                        <Database style={{ width: 40, height: 40, color: '#818cf8', animation: 'pulse 2s ease-in-out infinite' }} />
                                    </div>
                                    <h3 style={{ fontSize: 18, fontWeight: 800, color: '#fff', margin: '0 0 8px' }}>Slanje na CEZIH...</h3>
                                    <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', margin: 0 }}>
                                        Završavam ITI-65 transakciju i arhiviram dokument.
                                    </p>
                                    <Loader2 style={{ width: 24, height: 24, color: '#818cf8', animation: 'spin 1s linear infinite', marginTop: 16 }} />
                                </>
                            )}

                            {signingStatus === 'success' && (
                                <>
                                    <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'rgba(74,222,128,0.12)', border: '1px solid rgba(74,222,128,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', boxShadow: '0 0 40px rgba(74,222,128,0.2)' }}>
                                        <CheckCircle style={{ width: 40, height: 40, color: '#4ade80' }} />
                                    </div>
                                    <h3 style={{ fontSize: 18, fontWeight: 800, color: '#4ade80', margin: '0 0 8px' }}>Dokument je poslan!</h3>
                                    <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', margin: '0 0 20px' }}>
                                        Vaš nalaz je uspješno potpisan i trajno pohranjen u CEZIH repozitorij.
                                    </p>
                                    <button
                                        onClick={() => {
                                            setIsSigningModalOpen(false);
                                            router.push(`/dashboard/patients/${effectiveMbo}`);
                                        }}
                                        style={{ width: '100%', padding: '12px', background: 'linear-gradient(135deg,#14b8a6,#10d9a0)', border: 'none', borderRadius: 12, cursor: 'pointer', fontSize: 14, fontWeight: 700, color: '#fff', boxShadow: '0 4px 16px rgba(20,184,166,0.4)' }}
                                    >
                                        U redu
                                    </button>
                                </>
                            )}

                            {signingStatus === 'error' && (
                                <>
                                    <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                                        <AlertTriangle style={{ width: 40, height: 40, color: '#f87171' }} />
                                    </div>
                                    <h3 style={{ fontSize: 18, fontWeight: 800, color: '#fff', margin: '0 0 8px' }}>Greška</h3>
                                    <p style={{ fontSize: 13, color: '#fca5a5', fontWeight: 500, margin: '0 0 20px' }}>
                                        {signingError || 'Došlo je do pogreške prilikom potpisivanja.'}
                                    </p>
                                    <button
                                        onClick={() => setIsSigningModalOpen(false)}
                                        style={{ width: '100%', padding: '12px', background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 12, cursor: 'pointer', fontSize: 14, fontWeight: 700, color: '#fff' }}
                                    >
                                        Zatvori
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function ClinicalWorkspacePage() {
    return (
        <Suspense fallback={<div className="p-8 text-center text-slate-500">Učitavanje radnog prostora...</div>}>
            <ClinicalWorkspace />
        </Suspense>
    );
}
