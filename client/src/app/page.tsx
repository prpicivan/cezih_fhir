'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
    Shield, Smartphone, ArrowRight, CheckCircle, XCircle,
    Loader2, ArrowLeft, KeyRound, Fingerprint, Phone, ShieldCheck
} from 'lucide-react';
import Image from 'next/image';

type AuthView =
    | 'login-options'
    | 'certilia-initiating'  // Backend following gateway → SSO → Certilia
    | 'certilia-form'        // Credential form shown
    | 'certilia-submitting'  // Credentials being submitted
    | 'certilia-waiting'     // Waiting for mobile push approval
    | 'authenticated';       // Success — redirecting

export default function LoginPage() {
    const router = useRouter();
    const [systemStatus, setSystemStatus] = useState<'checking' | 'online' | 'offline'>('checking');
    const [authView, setAuthView] = useState<AuthView>('login-options');
    const [error, setError] = useState<string | null>(null);

    // Certilia form state
    const [certiliaSessionId, setCertiliaSessionId] = useState<string | null>(null);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [stepMessage, setStepMessage] = useState('');

    useEffect(() => { checkSystemStatus(); }, []);

    const checkSystemStatus = async () => {
        try {
            const res = await fetch('/api/health');
            setSystemStatus(res.ok ? 'online' : 'offline');
        } catch {
            setSystemStatus('offline');
        }
    };

    // ============================================================
    // Certilia Login Flow
    // ============================================================

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
            } catch {
                // Keep polling on network errors
            }
        }
        setError('Isteklo je vrijeme čekanja (2 min). Pokušajte ponovo.');
        setAuthView('certilia-form');
    };

    // ============================================================
    // Smart Card Login
    // ============================================================

    const handleSmartCardLogin = async () => {
        setError(null);
        setAuthView('certilia-initiating');
        setStepMessage('Pokretanje Smart Card prijave...');
        try {
            const res = await fetch('/api/auth/initiate?method=smartcard');
            const data = await res.json();
            if (data.success && data.authUrl) {
                window.location.href = data.authUrl;
            } else {
                throw new Error(data.error || 'Smart Card prijava nije uspjela');
            }
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

    // ============================================================
    // Step progress for visual feedback
    // ============================================================

    const getStepProgress = () => {
        switch (authView) {
            case 'certilia-initiating': return { step: 1, total: 4, label: 'Povezivanje' };
            case 'certilia-form': return { step: 2, total: 4, label: 'Prijava' };
            case 'certilia-submitting': return { step: 3, total: 4, label: 'Provjera' };
            case 'certilia-waiting': return { step: 3, total: 4, label: 'Odobrenje' };
            case 'authenticated': return { step: 4, total: 4, label: 'Gotovo' };
            default: return null;
        }
    };

    const progress = getStepProgress();

    // ============================================================
    // Render
    // ============================================================

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-indigo-50 p-4">

            {/* CSS Animations */}
            <style jsx global>{`
                @keyframes pulse-ring {
                    0% { transform: scale(0.9); opacity: 0.7; }
                    50% { transform: scale(1.05); opacity: 1; }
                    100% { transform: scale(0.9); opacity: 0.7; }
                }
                @keyframes slide-up {
                    from { opacity: 0; transform: translateY(16px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                @keyframes fade-in {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes bounce-check {
                    0% { transform: scale(0); }
                    60% { transform: scale(1.15); }
                    100% { transform: scale(1); }
                }
                @keyframes progress-fill {
                    from { width: 0%; }
                }
                .animate-slide-up {
                    animation: slide-up 0.4s ease-out forwards;
                }
                .animate-fade-in {
                    animation: fade-in 0.3s ease-out forwards;
                }
                .animate-bounce-check {
                    animation: bounce-check 0.5s ease-out forwards;
                }
                .animate-pulse-ring {
                    animation: pulse-ring 2s ease-in-out infinite;
                }
            `}</style>

            <div className="max-w-md w-full bg-white rounded-2xl shadow-xl overflow-hidden border border-slate-100">

                {/* Header */}
                <div className="bg-white p-8 pb-4 text-center">
                    <div className="mx-auto w-16 h-16 rounded-full flex items-center justify-center mb-4">
                        <Image
                            src="/wbs-logo.png"
                            alt="WBS Logo"
                            width={64}
                            height={64}
                            className="object-contain"
                        />
                    </div>
                    <h1 className="text-2xl font-bold mb-1 text-slate-900">WBS_FHIR</h1>
                    <p className="text-slate-500 text-sm">
                        {authView === 'login-options'
                            ? 'Sustav za digitalnu razmjenu medicinske dokumentacije'
                            : authView === 'authenticated'
                                ? 'Prijava uspješna!'
                                : 'Prijava putem Certilia mobile.ID'}
                    </p>
                </div>

                {/* System Status */}
                <div className="mx-8 mb-4 py-2 px-4 bg-slate-50 rounded-lg flex items-center justify-between text-sm">
                    <span className="text-slate-500">Status sustava:</span>
                    {systemStatus === 'checking' && <span className="text-slate-400">Provjera...</span>}
                    {systemStatus === 'online' && (
                        <span className="flex items-center text-emerald-600 font-medium gap-1">
                            <CheckCircle className="w-4 h-4" /> Online
                        </span>
                    )}
                    {systemStatus === 'offline' && (
                        <span className="flex items-center text-rose-600 font-medium gap-1">
                            <XCircle className="w-4 h-4" /> Offline
                        </span>
                    )}
                </div>

                {/* Step Progress Bar */}
                {progress && (
                    <div className="mx-8 mb-4 animate-fade-in">
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs text-slate-400 font-medium">
                                Korak {progress.step}/{progress.total}
                            </span>
                            <span className="text-xs text-indigo-600 font-semibold">{progress.label}</span>
                        </div>
                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-gradient-to-r from-indigo-500 to-indigo-600 rounded-full transition-all duration-700 ease-out"
                                style={{ width: `${(progress.step / progress.total) * 100}%` }}
                            />
                        </div>
                    </div>
                )}

                {/* Error */}
                {error && (
                    <div className="mx-8 mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-lg animate-slide-up flex items-start gap-2">
                        <XCircle className="w-4 h-4 mt-0.5 shrink-0" />
                        <span>{error}</span>
                    </div>
                )}

                {/* ====== View: Login Options ====== */}
                {authView === 'login-options' && (
                    <div className="p-8 pt-4 space-y-3 animate-slide-up">
                        <button
                            onClick={handleCertiliaLogin}
                            disabled={systemStatus !== 'online'}
                            className="w-full flex items-center justify-between p-4 border border-slate-200 rounded-xl hover:border-indigo-400 hover:bg-indigo-50/50 hover:shadow-md transition-all group disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <div className="flex items-center gap-4">
                                <div className="w-11 h-11 bg-gradient-to-br from-indigo-500 to-purple-600 text-white rounded-xl flex items-center justify-center shadow-sm">
                                    <Smartphone className="w-5 h-5" />
                                </div>
                                <div className="text-left">
                                    <div className="font-semibold text-slate-900">Certilia mobile.ID</div>
                                    <div className="text-xs text-slate-500">Prijava putem mobilnog uređaja</div>
                                </div>
                            </div>
                            <ArrowRight className="w-5 h-5 text-slate-300 group-hover:text-indigo-500 group-hover:translate-x-1 transition-all" />
                        </button>

                        <button
                            onClick={handleSmartCardLogin}
                            disabled={systemStatus !== 'online'}
                            className="w-full flex items-center justify-between p-4 border border-slate-200 rounded-xl hover:border-blue-400 hover:bg-blue-50/50 hover:shadow-md transition-all group disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <div className="flex items-center gap-4">
                                <div className="w-11 h-11 bg-gradient-to-br from-blue-500 to-cyan-600 text-white rounded-xl flex items-center justify-center shadow-sm">
                                    <Shield className="w-5 h-5" />
                                </div>
                                <div className="text-left">
                                    <div className="font-semibold text-slate-900">Pametna Kartica</div>
                                    <div className="text-xs text-slate-500">Prijava za zdravstvene djelatnike</div>
                                </div>
                            </div>
                            <ArrowRight className="w-5 h-5 text-slate-300 group-hover:text-blue-500 group-hover:translate-x-1 transition-all" />
                        </button>

                        <div className="pt-2 text-center">
                            <button
                                onClick={() => router.push('/dashboard/patients')}
                                className="text-xs text-slate-400 hover:text-slate-600 font-medium transition-colors"
                            >
                                Demo pristup (bez autentikacije)
                            </button>
                        </div>
                    </div>
                )}

                {/* ====== View: Initiating (connecting to gateway) ====== */}
                {authView === 'certilia-initiating' && (
                    <div className="p-8 pt-4 animate-slide-up">
                        <div className="flex flex-col items-center py-8">
                            <div className="relative mb-6">
                                <div className="w-20 h-20 rounded-full bg-indigo-50 flex items-center justify-center animate-pulse-ring">
                                    <Fingerprint className="w-10 h-10 text-indigo-500" />
                                </div>
                                <div className="absolute -bottom-1 -right-1 w-8 h-8 bg-white rounded-full shadow-md flex items-center justify-center">
                                    <Loader2 className="w-5 h-5 text-indigo-500 animate-spin" />
                                </div>
                            </div>
                            <p className="text-base font-semibold text-slate-800 mb-2">{stepMessage}</p>
                            <p className="text-sm text-slate-400 text-center">
                                Uspostavljanje veze s CEZIH gateway i Certilia servisom
                            </p>
                            <div className="mt-6 flex gap-1.5">
                                {[0, 1, 2].map(i => (
                                    <div
                                        key={i}
                                        className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce"
                                        style={{ animationDelay: `${i * 0.15}s` }}
                                    />
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* ====== View: Certilia Credential Form ====== */}
                {authView === 'certilia-form' && (
                    <form onSubmit={submitCertiliaCredentials} className="p-8 pt-4 space-y-4 animate-slide-up">
                        <div className="flex items-center gap-3 mb-2">
                            <div className="w-8 h-8 bg-indigo-100 text-indigo-600 rounded-lg flex items-center justify-center">
                                <KeyRound className="w-4 h-4" />
                            </div>
                            <span className="text-sm font-medium text-slate-700">
                                Unesite Certilia podatke za prijavu
                            </span>
                        </div>

                        <div>
                            <label htmlFor="username" className="block text-sm font-medium text-slate-700 mb-1">
                                E-mail ili OIB
                            </label>
                            <input
                                id="username"
                                type="text"
                                value={username}
                                onChange={e => setUsername(e.target.value)}
                                placeholder="npr. ime.prezime@email.hr"
                                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm text-slate-900 placeholder-slate-400 transition-shadow"
                                autoFocus
                                required
                            />
                        </div>

                        <div>
                            <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1">
                                Lozinka
                            </label>
                            <input
                                id="password"
                                type="password"
                                value={password}
                                onChange={e => setPassword(e.target.value)}
                                placeholder="Certilia lozinka"
                                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm text-slate-900 placeholder-slate-400 transition-shadow"
                                required
                            />
                        </div>

                        <button
                            type="submit"
                            disabled={!username || !password}
                            className="w-full py-3 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-700 hover:to-indigo-800 text-white font-semibold rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-md hover:shadow-lg"
                        >
                            <Smartphone className="w-4 h-4" />
                            Prijavi se
                        </button>

                        <p className="text-xs text-slate-400 text-center">
                            Nakon prijave, odobrite zahtjev u Certilia mobilnoj aplikaciji.
                        </p>

                        <button
                            type="button"
                            onClick={goBack}
                            className="w-full flex items-center justify-center gap-2 text-sm text-slate-500 hover:text-slate-700 transition-colors pt-1"
                        >
                            <ArrowLeft className="w-4 h-4" /> Natrag na odabir prijave
                        </button>
                    </form>
                )}

                {/* ====== View: Submitting Credentials ====== */}
                {authView === 'certilia-submitting' && (
                    <div className="p-8 pt-4 animate-slide-up">
                        <div className="flex flex-col items-center py-8">
                            <div className="relative mb-6">
                                <div className="w-20 h-20 rounded-full bg-amber-50 flex items-center justify-center animate-pulse-ring">
                                    <KeyRound className="w-10 h-10 text-amber-500" />
                                </div>
                                <div className="absolute -bottom-1 -right-1 w-8 h-8 bg-white rounded-full shadow-md flex items-center justify-center">
                                    <Loader2 className="w-5 h-5 text-amber-500 animate-spin" />
                                </div>
                            </div>
                            <p className="text-base font-semibold text-slate-800 mb-2">Provjera korisničkih podataka</p>
                            <p className="text-sm text-slate-400 text-center">
                                Certilia provjerava vaše podatke i priprema zahtjev za odobrenje
                            </p>
                            <div className="mt-6 flex gap-1.5">
                                {[0, 1, 2].map(i => (
                                    <div
                                        key={i}
                                        className="w-2 h-2 bg-amber-400 rounded-full animate-bounce"
                                        style={{ animationDelay: `${i * 0.15}s` }}
                                    />
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* ====== View: Waiting for Mobile Approval ====== */}
                {authView === 'certilia-waiting' && (
                    <div className="p-8 pt-4 animate-slide-up">
                        <div className="flex flex-col items-center py-6">
                            <div className="relative mb-6">
                                <div className="w-24 h-24 rounded-full bg-gradient-to-br from-indigo-50 to-purple-50 flex items-center justify-center animate-pulse-ring">
                                    <Phone className="w-12 h-12 text-indigo-500" />
                                </div>
                                <div className="absolute -top-1 -right-1 w-8 h-8 bg-white rounded-full shadow-md flex items-center justify-center">
                                    <Loader2 className="w-5 h-5 text-indigo-500 animate-spin" />
                                </div>
                                {/* Notification badge */}
                                <div className="absolute -top-2 -left-2 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center shadow-md animate-bounce" style={{ animationDuration: '1.5s' }}>
                                    <span className="text-white text-xs font-bold">1</span>
                                </div>
                            </div>

                            <h3 className="text-lg font-bold text-slate-800 mb-2">Odobrenje na mobilnom uređaju</h3>
                            <p className="text-sm text-slate-500 text-center max-w-xs mb-4">
                                Otvorite <strong>Certilia</strong> aplikaciju na vašem mobitelu i odobrite zahtjev za prijavu.
                            </p>

                            {/* Steps indicator */}
                            <div className="w-full max-w-xs space-y-2 mt-2">
                                <div className="flex items-center gap-3 p-2 rounded-lg bg-emerald-50">
                                    <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0" />
                                    <span className="text-sm text-emerald-700">Podaci provjereni</span>
                                </div>
                                <div className="flex items-center gap-3 p-2 rounded-lg bg-emerald-50">
                                    <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0" />
                                    <span className="text-sm text-emerald-700">Push obavijest poslana</span>
                                </div>
                                <div className="flex items-center gap-3 p-2 rounded-lg bg-indigo-50 border border-indigo-100">
                                    <Loader2 className="w-5 h-5 text-indigo-500 animate-spin shrink-0" />
                                    <span className="text-sm text-indigo-700 font-medium">Čeka se odobrenje...</span>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* ====== View: Authenticated ====== */}
                {authView === 'authenticated' && (
                    <div className="p-8 pt-4 animate-slide-up">
                        <div className="flex flex-col items-center py-8">
                            <div className="w-20 h-20 rounded-full bg-emerald-50 flex items-center justify-center mb-4 animate-bounce-check">
                                <ShieldCheck className="w-12 h-12 text-emerald-500" />
                            </div>
                            <h3 className="text-lg font-bold text-emerald-700 mb-1">Autentikacija uspješna!</h3>
                            <p className="text-sm text-slate-500 mb-4">Preusmjeravanje na sustav...</p>
                            <div className="w-48 h-1 bg-slate-100 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-gradient-to-r from-emerald-400 to-emerald-500 rounded-full"
                                    style={{ animation: 'progress-fill 1.5s ease-out forwards', width: '100%' }}
                                />
                            </div>
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
}
