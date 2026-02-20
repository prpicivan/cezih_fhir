'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, Smartphone, ArrowRight, CheckCircle, XCircle, Activity } from 'lucide-react';

export default function LoginPage() {
    const router = useRouter();
    const [systemStatus, setSystemStatus] = useState<'checking' | 'online' | 'offline'>('checking');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        checkSystemStatus();
    }, []);

    const checkSystemStatus = async () => {
        try {
            const res = await fetch('/api/health');
            if (res.ok) {
                setSystemStatus('online');
            } else {
                setSystemStatus('offline');
            }
        } catch (err) {
            setSystemStatus('offline');
        }
    };

    const handleLogin = async (method: 'smartcard' | 'certilia') => {
        setLoading(true);
        setError(null);

        try {
            // In a real scenario, this would redirect to the CEZIH IdP
            const endpoint = method === 'smartcard' ? '/api/auth/smartcard' : '/api/auth/certilia';
            const res = await fetch(endpoint);
            const data = await res.json();

            if (data.authUrl) {
                // Redirect to CEZIH IdP
                window.location.href = data.authUrl;
            } else {
                // Fallback for demo/error
                throw new Error('Authentication URL not received');
            }
        } catch (err: any) {
            setError(err.message || 'Login failed');
            setLoading(false);
        }
    };

    const handleDemoLogin = () => {
        // Bypass auth for demonstration purposes
        router.push('/dashboard');
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
            <div className="max-w-md w-full bg-white rounded-xl shadow-lg overflow-hidden border border-slate-200">

                {/* Header */}
                <div className="bg-blue-600 p-8 text-center text-white">
                    <div className="mx-auto bg-blue-500 w-16 h-16 rounded-full flex items-center justify-center mb-4 shadow-inner">
                        <Activity className="w-8 h-8 text-white" />
                    </div>
                    <h1 className="text-2xl font-bold mb-2">CEZIH PIS</h1>
                    <p className="text-blue-100 text-sm">Sustav za upravljanje poliklinikom</p>
                </div>

                {/* System Status */}
                <div className="px-8 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between text-sm">
                    <span className="text-slate-500">Status sustava:</span>
                    <div className="flex items-center gap-2">
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
                </div>

                {/* Login Options */}
                <div className="p-8 space-y-4">
                    {error && (
                        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-sm rounded-lg mb-4">
                            {error}
                        </div>
                    )}

                    <button
                        onClick={() => handleLogin('smartcard')}
                        disabled={loading || systemStatus !== 'online'}
                        className="w-full flex items-center justify-between p-4 border border-slate-200 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition-all group disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center group-hover:bg-blue-500 group-hover:text-white transition-colors">
                                <Shield className="w-5 h-5" />
                            </div>
                            <div className="text-left">
                                <div className="font-semibold text-slate-900">Pametna Kartica</div>
                                <div className="text-xs text-slate-500">Prijava za zdravstvene djelatnike</div>
                            </div>
                        </div>
                        <ArrowRight className="w-5 h-5 text-slate-300 group-hover:text-blue-500 transition-colors" />
                    </button>

                    <button
                        onClick={() => handleLogin('certilia')}
                        disabled={loading || systemStatus !== 'online'}
                        className="w-full flex items-center justify-between p-4 border border-slate-200 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition-all group disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center group-hover:bg-indigo-500 group-hover:text-white transition-colors">
                                <Smartphone className="w-5 h-5" />
                            </div>
                            <div className="text-left">
                                <div className="font-semibold text-slate-900">Certilia mobile.ID</div>
                                <div className="text-xs text-slate-500">Prijava putem mobilnog uređaja</div>
                            </div>
                        </div>
                        <ArrowRight className="w-5 h-5 text-slate-300 group-hover:text-indigo-500 transition-colors" />
                    </button>
                </div>

                {/* Demo Footer */}
                <div className="px-8 py-4 bg-slate-50 border-t border-slate-100 text-center">
                    <button
                        onClick={handleDemoLogin}
                        className="text-xs text-slate-400 hover:text-slate-600 font-medium"
                    >
                        Demo pristup (Bypass Auth)
                    </button>
                </div>
            </div>
        </div>
    );
}
