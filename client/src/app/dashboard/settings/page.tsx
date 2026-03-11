'use client';

import { useState, useEffect } from 'react';
import { useToast, Toast } from '@/components/Toast';
import {
    Settings,
    RefreshCw,
    Server,
    Database,
    ShieldCheck,
    ChevronUp,
    ChevronDown,
    Eye,
    EyeOff,
    Save,
    LayoutDashboard,
    Users,
    Calendar,
    Activity,
    Award,
    FileText,
    RotateCcw
} from 'lucide-react';

const iconMap: Record<string, any> = {
    LayoutDashboard,
    Users,
    Calendar,
    Activity,
    Settings,
    ShieldCheck,
    Award
};

export default function SettingsPage() {
    const { toast, showToast, hideToast } = useToast();
    const [settings, setSettings] = useState<any>({});
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [menuConfig, setMenuConfig] = useState<any[]>([]);
    const [savingMenu, setSavingMenu] = useState(false);
    const [skipIdenModal, setSkipIdenModal] = useState(false);

    // Document type labels
    const DEFAULT_DOC_LABELS: Record<string, string> = {
        '011': 'Izvješće nakon pregleda u ambulanti privatne zdravstvene ustanove',
        '012': 'Nalazi iz specijalističke ordinacije privatne zdravstvene ustanove',
        '013': 'Otpusno pismo iz privatne zdravstvene ustanove',
    };
    const [docTypeLabels, setDocTypeLabels] = useState<Record<string, string>>(DEFAULT_DOC_LABELS);
    const [savingDocTypes, setSavingDocTypes] = useState(false);

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

    const fetchMenu = () => {
        fetch('/api/settings/menu')
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    setMenuConfig(data.config.sort((a: any, b: any) => a.orderIndex - b.orderIndex));
                }
            })
            .catch(err => console.error('Failed to fetch menu:', err));
    };

    const fetchDocTypeLabels = () => {
        fetch('/api/settings/document-types')
            .then(res => res.json())
            .then(data => {
                if (data.success && data.labels) setDocTypeLabels(data.labels);
            })
            .catch(err => console.error('Failed to fetch doc type labels:', err));
    };

    useEffect(() => {
        fetchSettings();
        fetchMenu();
        fetchDocTypeLabels();
        
        // Load development settings
        const skip = localStorage.getItem('skip_iden_modal') === 'true';
        setSkipIdenModal(skip);
    }, []);

    const handleToggleIdenModal = (checked: boolean) => {
        setSkipIdenModal(checked);
        localStorage.setItem('skip_iden_modal', checked ? 'true' : 'false');
        showToast('success', checked ? 'IDEN modali onemogućeni.' : 'IDEN modali omogućeni.');
    };

    const handleSync = async () => {
        setSyncing(true);
        try {
            const res = await fetch('/api/settings/sync', { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                showToast('success', 'Sinkronizacija uspješna!');
                fetchSettings();
            } else {
                showToast('error', 'Greška pri sinkronizaciji.');
            }
        } catch (error) {
            showToast('error', 'Greška pri komunikaciji sa serverom.');
        } finally {
            setSyncing(false);
        }
    };

    const toggleVisibility = (id: string) => {
        setMenuConfig(prev => prev.map(item =>
            item.id === id ? { ...item, isVisible: !item.isVisible } : item
        ));
    };

    const moveItem = (index: number, direction: 'up' | 'down') => {
        if (direction === 'up' && index === 0) return;
        if (direction === 'down' && index === menuConfig.length - 1) return;

        const newItems = [...menuConfig];
        const targetIndex = direction === 'up' ? index - 1 : index + 1;
        [newItems[index], newItems[targetIndex]] = [newItems[targetIndex], newItems[index]];

        // Update orderIndex
        const updated = newItems.map((item, idx) => ({ ...item, orderIndex: idx }));
        setMenuConfig(updated);
    };

    const saveMenuConfig = async () => {
        setSavingMenu(true);
        try {
            const res = await fetch('/api/settings/menu', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(menuConfig)
            });
            const data = await res.json();
            if (data.success) {
                showToast('success', 'Postavke izbornika spremljene! Stranica se osvježava...');
                window.location.reload(); // Refresh to update layout
            }
        } catch (err) {
            showToast('error', 'Greška pri spremanju izbornika.');
        } finally {
            setSavingMenu(false);
        }
    };

    const saveDocTypeLabels = async () => {
        setSavingDocTypes(true);
        try {
            const res = await fetch('/api/settings/document-types', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(docTypeLabels)
            });
            const data = await res.json();
            if (data.success) {
                showToast('success', 'Nazivi tipova dokumenata spremljeni!');
            } else {
                showToast('error', 'Greška pri spremanju.');
            }
        } catch (err) {
            showToast('error', 'Greška pri komunikaciji sa serverom.');
        } finally {
            setSavingDocTypes(false);
        }
    };

    const resetDocTypeLabels = () => {
        setDocTypeLabels({ ...DEFAULT_DOC_LABELS });
    };

    return (
        <div className="space-y-6">
            <Toast toast={toast} onClose={hideToast} />
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <Settings className="w-8 h-8 text-blue-600" />
                        Postavke Sustava
                    </h1>
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
                <div className="space-y-8">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Connection Status */}
                        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-4">
                            <div className="flex items-center gap-3 text-blue-600 mb-2">
                                <Server className="w-6 h-6" />
                                <h2 className="text-lg font-semibold text-gray-900">Status Konekcije</h2>
                            </div>
                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Okruženje:</span>
                                    <span className="font-medium bg-green-100 text-green-800 px-2 py-0.5 rounded text-xs uppercase">{settings.environment || 'Development'}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-500">CEZIH URL:</span>
                                    <span className="font-medium text-slate-700 truncate max-w-[150px]" title={settings.cezihUrl}>{settings.cezihUrl || 'N/A'}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Vrijeme Servera:</span>
                                    <span className="font-medium">{new Date(settings.serverTime).toLocaleTimeString()}</span>
                                </div>
                            </div>
                        </div>

                        {/* Terminology Status */}
                        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-4">
                            <div className="flex items-center gap-3 text-purple-600 mb-2">
                                <Database className="w-6 h-6" />
                                <h2 className="text-lg font-semibold text-gray-900">Terminologija</h2>
                            </div>
                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Zadnja sinkronizacija:</span>
                                    <span className="font-medium">
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
                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-gray-500">Pametna Kartica:</span>
                                    <span className="font-medium text-green-600">Detektirana</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-500">VPN Tunel:</span>
                                    <span className="font-medium text-gray-400">Nije spojen (Demo Mode)</span>
                                </div>
                            </div>
                        </div>

                        {/* Development Settings */}
                        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-4">
                            <div className="flex items-center gap-3 text-amber-600 mb-2">
                                <Activity className="w-6 h-6" />
                                <h2 className="text-lg font-semibold text-gray-900">Razvojne postavke</h2>
                            </div>
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <div className="space-y-0.5">
                                        <label className="text-sm font-medium text-gray-800">Onemogući IDEN modale</label>
                                        <p className="text-xs text-gray-500">Preskoči vizualni potpis kod TC akcija</p>
                                    </div>
                                    <button
                                        onClick={() => handleToggleIdenModal(!skipIdenModal)}
                                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${skipIdenModal ? 'bg-amber-600' : 'bg-gray-200'}`}
                                    >
                                        <span
                                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${skipIdenModal ? 'translate-x-6' : 'translate-x-1'}`}
                                        />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Menu Customization Section */}
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                        <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                                <LayoutDashboard className="w-5 h-5 text-blue-600" />
                                Prilagodba glavnog izbornika
                            </h2>
                            <button
                                onClick={saveMenuConfig}
                                disabled={savingMenu}
                                className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-1.5 rounded-lg hover:bg-emerald-700 transition disabled:opacity-50 text-sm font-medium"
                            >
                                <Save className="w-4 h-4" />
                                {savingMenu ? 'Spremanje...' : 'Spremi promjene'}
                            </button>
                        </div>
                        <div className="p-4">
                            <div className="space-y-2">
                                {menuConfig.map((item, index) => {
                                    const IconNode = iconMap[item.icon] || LayoutDashboard;
                                    return (
                                        <div
                                            key={item.id}
                                            className={`flex items-center justify-between p-3 rounded-lg border transition-all ${item.isVisible ? 'bg-white border-slate-200' : 'bg-slate-50 border-slate-100 opacity-60'}`}
                                        >
                                            <div className="flex items-center gap-4">
                                                <div className="flex flex-col gap-0.5">
                                                    <button
                                                        onClick={() => moveItem(index, 'up')}
                                                        disabled={index === 0}
                                                        className="p-0.5 hover:bg-slate-100 rounded disabled:opacity-30 disabled:hover:bg-transparent"
                                                    >
                                                        <ChevronUp className="w-4 h-4 text-slate-500" />
                                                    </button>
                                                    <button
                                                        onClick={() => moveItem(index, 'down')}
                                                        disabled={index === menuConfig.length - 1}
                                                        className="p-0.5 hover:bg-slate-100 rounded disabled:opacity-30 disabled:hover:bg-transparent"
                                                    >
                                                        <ChevronDown className="w-4 h-4 text-slate-500" />
                                                    </button>
                                                </div>
                                                <div className={`p-2 rounded-lg ${item.isVisible ? 'bg-blue-50 text-blue-600' : 'bg-slate-200 text-slate-500'}`}>
                                                    <IconNode className="w-5 h-5" />
                                                </div>
                                                <div>
                                                    <div className="font-bold text-slate-800 text-sm">{item.name}</div>
                                                    <div className="text-[10px] text-slate-400 font-mono italic">{item.href}</div>
                                                </div>
                                            </div>

                                            <button
                                                onClick={() => toggleVisibility(item.id)}
                                                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${item.isVisible
                                                    ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                                                    }`}
                                            >
                                                {item.isVisible ? (
                                                    <><Eye className="w-3.5 h-3.5" /> VIDLJIVO</>
                                                ) : (
                                                    <><EyeOff className="w-3.5 h-3.5" /> SKRIVENO</>
                                                )}
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    {/* Document Type Labels Section */}
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                        <div className="p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
                            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                                <FileText className="w-5 h-5 text-amber-600" />
                                Nazivi kliničke dokumentacije
                            </h2>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={resetDocTypeLabels}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-500 hover:bg-slate-100 transition"
                                    title="Vrati na zadane nazive"
                                >
                                    <RotateCcw className="w-3.5 h-3.5" />
                                    Zadani
                                </button>
                                <button
                                    onClick={saveDocTypeLabels}
                                    disabled={savingDocTypes}
                                    className="flex items-center gap-2 bg-emerald-600 text-white px-4 py-1.5 rounded-lg hover:bg-emerald-700 transition disabled:opacity-50 text-sm font-medium"
                                >
                                    <Save className="w-4 h-4" />
                                    {savingDocTypes ? 'Spremanje...' : 'Spremi'}
                                </button>
                            </div>
                        </div>
                        <div className="p-4 space-y-4">
                            <p className="text-xs text-slate-400 font-medium">
                                Prilagodite nazive koji se prikazuju u sučelju za svaki tip CEZIH kliničkog dokumenta.
                            </p>
                            {Object.entries(docTypeLabels).map(([code, label]) => (
                                <div key={code} className="flex items-start gap-3">
                                    <div className="flex-shrink-0 mt-2.5">
                                        <span className="inline-block bg-amber-50 text-amber-700 font-mono font-black text-xs px-2.5 py-1 rounded-lg border border-amber-100">
                                            {code}
                                        </span>
                                    </div>
                                    <div className="flex-1">
                                        <input
                                            type="text"
                                            value={label}
                                            onChange={e => setDocTypeLabels(prev => ({ ...prev, [code]: e.target.value }))}
                                            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-medium text-slate-800 focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
