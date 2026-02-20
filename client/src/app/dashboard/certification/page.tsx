'use client';

import { useState, useEffect } from 'react';
import {
    CheckCircle,
    XCircle,
    Clock,
    Play,
    Info,
    Terminal,
    Shield,
    Layout,
    Users,
    FileText,
    Activity,
    AlertCircle
} from 'lucide-react';

interface TestCase {
    id: string;
    title: string;
    description: string;
    status: 'pending' | 'passed' | 'failed' | 'running';
    error?: string;
    diagnostic?: string;
}

interface TestGroup {
    name: string;
    icon: any;
    cases: TestCase[];
}

export default function CertificationPage() {
    const [groups, setGroups] = useState<TestGroup[]>([
        {
            name: 'Pristup i Autorizacija',
            icon: Shield,
            cases: [
                { id: 'tc-1', title: 'TC-1: Smart Card Login', description: 'Prijava zdravstvenog djelatnika putem AKD pametne kartice.', status: 'pending' },
                { id: 'tc-2', title: 'TC-2: Mobile ID Login', description: 'Prijava putem Certilia Mobile.ID aplikacije (MFA).', status: 'pending' },
                { id: 'tc-3', title: 'TC-3: System Token', description: 'Dohvat OAuth2 tokena za sustav putem client_credentials.', status: 'pending' },
            ]
        },
        {
            name: 'Infrastruktura i Sigurnost',
            icon: Terminal,
            cases: [
                { id: 'tc-4', title: 'TC-4: Digitalni potpis (Card)', description: 'Provjera valjanosti potpisa generiranog na kartici.', status: 'pending' },
                { id: 'tc-5', title: 'TC-5: Digitalni potpis (Cloud)', description: 'Provjera valjanosti udaljenog (Cloud) potpisa.', status: 'pending' },
                { id: 'tc-6', title: 'TC-6: Generiranje OID-a', description: 'Dohvat jedinstvenog identifikatora za dokument iz registra.', status: 'pending' },
                { id: 'tc-7', title: 'TC-7: Šifrarnici (CodeSystem)', description: 'Sinkronizacija nacionalnih šifrarnika (CodeSystem).', status: 'pending' },
                { id: 'tc-8', title: 'TC-8: Šifrarnici (ValueSet)', description: 'Sinkronizacija skupova vrijednosti (ValueSet).', status: 'pending' },
                { id: 'tc-9', title: 'TC-9: Pretraživanje registara', description: 'Pretraga registra ustanova i djelatnika (ITI-90).', status: 'pending' },
            ]
        },
        {
            name: 'Upravljanje Pacijentima',
            icon: Users,
            cases: [
                { id: 'tc-10', title: 'TC-10: Identifikacija (MBO)', description: 'Dohvat demografskih podataka pacijenta putem MBO-a.', status: 'pending' },
                { id: 'tc-11', title: 'TC-11: Registracija Stranca', description: 'Registracija pacijenta s EU karticom (IHE PMIR).', status: 'pending' },
            ]
        },
        {
            name: 'Posjeti i Slučajevi',
            icon: Layout,
            cases: [
                { id: 'tc-12', title: 'TC-12: Otvaranje posjeta', description: 'Slanje FHIR poruke za početak ambulantnog pregleda.', status: 'pending' },
                { id: 'tc-13', title: 'TC-13: Izmjena posjeta', description: 'Ažuriranje podataka aktivnog posjeta (dijagnoza, status).', status: 'pending' },
                { id: 'tc-14', title: 'TC-14: Zatvaranje posjeta', description: 'Slanje konačnog statusa posjeta nacionalnom sustavu.', status: 'pending' },
                { id: 'tc-15', title: 'TC-15: Pretraga epizoda', description: 'Pretraživanje povijesti epizoda liječenja za pacijenta.', status: 'pending' },
                { id: 'tc-16', title: 'TC-16: Otvaranje epizode', description: 'Kreiranje nove epizode skrbi za kontinuirano liječenje.', status: 'pending' },
                { id: 'tc-17', title: 'TC-17: Zatvaranje epizode', description: 'Formalno zatvaranje i arhiviranje epizode liječenja.', status: 'pending' },
            ]
        },
        {
            name: 'Medicinska Dokumentacija',
            icon: FileText,
            cases: [
                { id: 'tc-18', title: 'TC-18: Slanje nalaza', description: 'Slanje strukturiranog medicinskog nalaza u repozitorij.', status: 'pending' },
                { id: 'tc-19', title: 'TC-19: Zamjena nalaza', description: 'Slanje nove verzije nalaza kojom se povlači prethodna.', status: 'pending' },
                { id: 'tc-20', title: 'TC-20: Storniranje nalaza', description: 'Povlačenje nalaza poslanog greškom (Entered-in-error).', status: 'pending' },
                { id: 'tc-21', title: 'TC-21: Pretraga dokumenata', description: 'Pronalaženje dokumenata pacijenta u MHD repozitoriju.', status: 'pending' },
                { id: 'tc-22', title: 'TC-22: Dohvat dokumenta', description: 'Preuzimanje samog sadržaja dokumenta (Binary) iz registra.', status: 'pending' },
            ]
        }
    ]);

    const [auditLogs, setAuditLogs] = useState<any[]>([]);
    const [runningAll, setRunningAll] = useState(false);

    const runTest = async (tcId: string) => {
        updateCaseStatus(tcId, 'running');
        addAuditEntry(tcId, `Pokrećem test ${tcId.toUpperCase()}...`, 'info');

        try {
            const res = await fetch(`/api/certification/run/${tcId}`, { method: 'POST' });
            const data = await res.json();

            if (data.success) {
                updateCaseStatus(tcId, 'passed');
                addAuditEntry(tcId, `Test ${tcId.toUpperCase()} PROŠAO.`, 'success', data.result);
            } else {
                updateCaseStatus(tcId, 'failed', data.error, data.diagnostic);
                addAuditEntry(tcId, `Test ${tcId.toUpperCase()} NIJE PROŠAO: ${data.error}`, 'error');
            }
        } catch (err: any) {
            updateCaseStatus(tcId, 'failed', err.message);
            addAuditEntry(tcId, `Sustavna greška pri testu ${tcId.toUpperCase()}: ${err.message}`, 'error');
        }
    };

    const updateCaseStatus = (tcId: string, status: any, error?: string, diagnostic?: string) => {
        setGroups(prev => prev.map(group => ({
            ...group,
            cases: group.cases.map(c => c.id === tcId ? { ...c, status, error, diagnostic } : c)
        })));
    };

    const addAuditEntry = (tcId: string, message: string, type: string, details?: any) => {
        setAuditLogs(prev => [
            { id: Date.now(), tcId, message, type, timestamp: new Date().toLocaleTimeString(), details },
            ...prev
        ].slice(0, 50));
    };

    const runAll = async () => {
        setRunningAll(true);
        const allCases = groups.flatMap(g => g.cases);
        for (const tc of allCases) {
            await runTest(tc.id);
        }
        setRunningAll(false);
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'passed': return <CheckCircle className="w-5 h-5 text-emerald-500" />;
            case 'failed': return <XCircle className="w-5 h-5 text-rose-500" />;
            case 'running': return <Clock className="w-5 h-5 text-blue-500 animate-spin" />;
            default: return <div className="w-5 h-5 rounded-full border-2 border-slate-200" />;
        }
    };

    return (
        <div className="flex flex-col lg:flex-row gap-6 h-[calc(100vh-120px)]">
            {/* Main Test Suite */}
            <div className="flex-1 overflow-y-auto pr-2 space-y-6">
                <div className="flex items-center justify-between sticky top-0 bg-slate-50 py-4 z-10">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900">FHIR Certification Test Bench</h1>
                        <p className="text-slate-500 text-sm">Automatska provjera sukladnosti s CEZIH specifikacijama</p>
                    </div>
                    <button
                        onClick={runAll}
                        disabled={runningAll}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-xl text-sm font-semibold flex items-center gap-2 shadow-lg shadow-blue-200 transition-all disabled:opacity-50"
                    >
                        <Play className="w-4 h-4 fill-current" />
                        Pokreni sve testove
                    </button>
                </div>

                <div className="space-y-8">
                    {groups.map((group, gIdx) => (
                        <div key={gIdx} className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                            <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center gap-3">
                                <group.icon className="w-5 h-5 text-slate-500" />
                                <h2 className="font-bold text-slate-800">{group.name}</h2>
                                <span className="ml-auto text-xs font-medium text-slate-400 uppercase tracking-wider">
                                    {group.cases.length} SCAN SCENARIOS
                                </span>
                            </div>
                            <div className="divide-y divide-slate-100">
                                {group.cases.map(tc => (
                                    <div key={tc.id} className="p-6 hover:bg-slate-50/50 transition-colors group">
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-4">
                                                {getStatusIcon(tc.status)}
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <h4 className="font-bold text-slate-900">{tc.title}</h4>
                                                        {tc.status === 'failed' && tc.diagnostic && (
                                                            <div className="relative group/diagnostic">
                                                                <Info className="w-4 h-4 text-blue-500 cursor-help" />
                                                                <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 w-64 p-3 bg-slate-900 text-white text-xs rounded-lg shadow-xl opacity-0 invisible group-hover/diagnostic:opacity-100 group-hover/diagnostic:visible transition-all z-20">
                                                                    <div className="font-bold text-blue-400 mb-1">🔍 DIJAGNOSTIKA POGREŠKE</div>
                                                                    {tc.diagnostic}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </div>
                                                    <p className="text-sm text-slate-500 leading-relaxed">{tc.description}</p>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => runTest(tc.id)}
                                                disabled={tc.status === 'running' || runningAll}
                                                className="opacity-0 group-hover:opacity-100 focus:opacity-100 bg-slate-100 hover:bg-blue-600 hover:text-white text-slate-700 px-4 py-1.5 rounded-lg text-xs font-bold transition-all disabled:opacity-30"
                                            >
                                                POKRENI
                                            </button>
                                        </div>
                                        {tc.status === 'failed' && tc.error && (
                                            <div className="mt-3 ml-9 p-3 bg-rose-50 border border-rose-100 rounded-lg text-xs text-rose-700 font-mono">
                                                ERROR: {tc.error}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Audit Feed Side Panel */}
            <div className="w-full lg:w-96 bg-slate-900 rounded-2xl flex flex-col overflow-hidden shadow-2xl border border-slate-800">
                <div className="p-4 bg-slate-800 border-b border-slate-700 flex items-center justify-between">
                    <h3 className="text-slate-200 font-bold text-sm flex items-center gap-2">
                        <Terminal className="w-4 h-4 text-blue-400" />
                        CEZIH AUDIT FEED
                    </h3>
                    <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-4 font-mono">
                    {auditLogs.length === 0 ? (
                        <div className="text-slate-600 text-xs italic text-center mt-10">
                            Nema zapisa. Pokrenite test za pregled prometa.
                        </div>
                    ) : (
                        auditLogs.map(log => (
                            <div key={log.id} className={`text-[11px] leading-relaxed border-l-2 pl-3 ${log.type === 'error' ? 'border-rose-500 bg-rose-500/5' :
                                log.type === 'success' ? 'border-emerald-500 bg-emerald-500/5' :
                                    'border-blue-500 bg-blue-500/5'
                                } py-2`}>
                                <div className="flex justify-between text-[10px] opacity-40 text-white mb-1">
                                    <span>TC: {log.tcId?.toUpperCase()}</span>
                                    <span>{log.timestamp}</span>
                                </div>
                                <div className={
                                    log.type === 'error' ? 'text-rose-400' :
                                        log.type === 'success' ? 'text-emerald-400' :
                                            'text-blue-400'
                                }>
                                    {log.message}
                                </div>
                                {log.details && (
                                    <pre className="mt-2 text-[10px] text-slate-400 overflow-x-auto bg-black/40 p-2 rounded">
                                        {JSON.stringify(log.details, null, 2)}
                                    </pre>
                                )}
                            </div>
                        ))
                    )}
                </div>
                <div className="p-3 bg-slate-800/50 border-t border-slate-700 text-[10px] text-slate-500 flex justify-between">
                    <span>LIVE FHIR MONITORING</span>
                    <span className="text-blue-400 opacity-60">v1.2-STABLE</span>
                </div>
            </div>
        </div>
    );
}
