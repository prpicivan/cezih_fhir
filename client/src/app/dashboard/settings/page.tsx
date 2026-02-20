'use client';

import { useState, useEffect } from 'react';
import { Settings, RefreshCw, Server, Database, ShieldCheck } from 'lucide-react';

export default function SettingsPage() {
    const [settings, setSettings] = useState<any>({});
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);

    const fetchSettings = () => {
        setLoading(true);
        fetch('/api/settings')
            .then(res => res.json())
            .then(data => {
                if (data.success) setSettings(data.settings);
                setLoading(false);
            })
            .catch(err => {
                console.error('Failed to fetch settings:', err);
                setLoading(false);
            });
    };

    useEffect(() => {
        fetchSettings();
    }, []);

    const handleSync = async () => {
        setSyncing(true);
        try {
            const res = await fetch('/api/settings/sync', { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                alert('Sinkronizacija uspješna!');
                fetchSettings();
            } else {
                alert('Greška pri sinkronizaciji.');
            }
        } catch (error) {
            alert('Greška pri komunikaciji sa serverom.');
        } finally {
            setSyncing(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Postavke Sustava</h1>
                    <p className="text-gray-600">Status CEZIH konekcije i lokalne konfiguracije</p>
                </div>
                <button
                    onClick={handleSync}
                    disabled={syncing}
                    className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
                >
                    <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
                    {syncing ? 'Sinkronizacija...' : 'Osvježi Šifrarnike'}
                </button>
            </div>

            {loading ? (
                <div className="text-center p-8 text-gray-500">Učitavanje postavki...</div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {/* Connection Status */}
                    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-4">
                        <div className="flex items-center gap-3 text-blue-600 mb-2">
                            <Server className="w-6 h-6" />
                            <h2 className="text-lg font-semibold text-gray-900">Status Konekcije</h2>
                        </div>
                        <div className="space-y-2">
                            <div className="flex justify-between">
                                <span className="text-gray-500">Okruženje:</span>
                                <span className="font-medium bg-green-100 text-green-800 px-2 py-0.5 rounded text-xs uppercase">{settings.environment || 'Development'}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-500">CEZIH URL:</span>
                                <span className="font-medium text-sm truncate max-w-[150px]" title={settings.cezihUrl}>{settings.cezihUrl || 'N/A'}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-500">Vrijeme Servera:</span>
                                <span className="font-medium text-sm">{new Date(settings.serverTime).toLocaleTimeString()}</span>
                            </div>
                        </div>
                    </div>

                    {/* Terminology Status */}
                    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-4">
                        <div className="flex items-center gap-3 text-purple-600 mb-2">
                            <Database className="w-6 h-6" />
                            <h2 className="text-lg font-semibold text-gray-900">Terminologija</h2>
                        </div>
                        <div className="space-y-2">
                            <div className="flex justify-between">
                                <span className="text-gray-500">Zadnja sinkronizacija:</span>
                                <span className="font-medium text-sm">
                                    {settings.terminology_last_sync ? new Date(settings.terminology_last_sync).toLocaleString() : 'Nikad'}
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-500">Code Systems:</span>
                                <span className="font-medium">{settings.code_systems_count || 0}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-500">Value Sets:</span>
                                <span className="font-medium">{settings.value_sets_count || 0}</span>
                            </div>
                        </div>
                    </div>

                    {/* Security Status */}
                    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-4">
                        <div className="flex items-center gap-3 text-green-600 mb-2">
                            <ShieldCheck className="w-6 h-6" />
                            <h2 className="text-lg font-semibold text-gray-900">Sigurnost</h2>
                        </div>
                        <div className="space-y-2">
                            <div className="flex justify-between">
                                <span className="text-gray-500">Pametna Kartica:</span>
                                <span className="font-medium text-green-600 text-sm">Detektirana</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-500">VPN Tunel:</span>
                                <span className="font-medium text-gray-400 text-sm">Nije spojen (Demo Mode)</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
