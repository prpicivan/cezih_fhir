'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import {
    CheckCircle, XCircle, Clock, Play, AlertTriangle,
    Shield, Terminal, Users, Layout, FileText,
    ChevronDown, ChevronRight, Printer, RefreshCw,
    Wifi, WifiOff, Info
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────
type TCStatus = 'idle' | 'running' | 'passed' | 'local' | 'failed' | 'skip';

interface TCResult {
    httpStatus?: number;
    durationMs?: number;
    request?: any;
    response?: any;
    localOnly?: boolean;
    cezihError?: string;
}

interface TC {
    id: string;
    title: string;
    description: string;
    endpoint: string;
    method: string;
    status: TCStatus;
    result?: TCResult;
    skipReason?: string;
}

interface TCGroup {
    name: string;
    icon: any;
    cases: TC[];
}

// ─────────────────────────────────────────────────────────────────
// Test definitions
// ─────────────────────────────────────────────────────────────────
const PATIENT_MBO = '999999423';
const PRACTITIONER_OIB = '30160453873';
const ORGANIZATION_ID = '174900715';

function buildGroups(): TCGroup[] {
    return [
        {
            name: 'Pristup i Autorizacija',
            icon: Shield,
            cases: [
                { id: 'tc-1', title: 'TC1 — Smart Card Login', description: 'Prijava zdravstvenog djelatnika putem AKD pametne kartice.', endpoint: '/api/auth/smartcard/gateway', method: 'POST', status: 'skip', skipReason: 'Zahtijeva fizički AKD čitač kartice i browser TLS flow' },
                { id: 'tc-2', title: 'TC2 — Certilia mobile.ID Login', description: 'Prijava putem Certilia Mobile.ID aplikacije (MFA).', endpoint: '/api/auth/certilia/initiate', method: 'POST', status: 'skip', skipReason: 'Certilia lozinka istekla / mobilni push ne stiže na uređaj' },
                { id: 'tc-3', title: 'TC3 — System Token (M2M)', description: 'Dohvat OAuth2 JWT tokena putem client_credentials granta.', endpoint: '/api/auth/system-token', method: 'POST', status: 'idle' },
            ]
        },
        {
            name: 'Infrastruktura i Sigurnost',
            icon: Terminal,
            cases: [
                { id: 'tc-4', title: 'TC4 — Digitalni potpis (Kartica)', description: 'Potpis dokumenta na AKD kartici (PKCS#11).', endpoint: '/api/sign/smartcard', method: 'POST', status: 'skip', skipReason: 'Zahtijeva AKD PKCS#11 modul i SIGN PIN' },
                { id: 'tc-5', title: 'TC5 — Digitalni potpis (Certilia Cloud)', description: 'Udaljeni Certilia Cloud potpis dokumenta.', endpoint: '/api/sign/certilia', method: 'POST', status: 'skip', skipReason: 'Zahtijeva ispravan Certilia račun (blokiran kao TC2)' },
                { id: 'tc-6', title: 'TC6 — Generiranje OID-a (ITI-98)', description: 'Dohvat jedinstvenog OID identifikatora iz CEZIH registra.', endpoint: '/api/oid/generate', method: 'POST', status: 'idle' },
                { id: 'tc-7', title: 'TC7 — Sync CodeSystems (ITI-96)', description: 'Sinkronizacija nacionalnih šifrarnika (CodeSystem).', endpoint: '/api/terminology/sync', method: 'POST', status: 'idle' },
                { id: 'tc-8', title: 'TC8 — Sync ValueSets (ITI-95)', description: 'Sinkronizacija skupova vrijednosti (ValueSet).', endpoint: '/api/terminology/sync', method: 'POST', status: 'idle' },
                { id: 'tc-9', title: 'TC9 — Registar organizacija (mCSD)', description: 'Pretraga registra ustanova i djelatnika (IHE mCSD ITI-90).', endpoint: '/api/registry/organizations', method: 'GET', status: 'idle' },
            ]
        },
        {
            name: 'Upravljanje Pacijentima',
            icon: Users,
            cases: [
                { id: 'tc-10', title: 'TC10 — Identifikacija pacijenta (MBO)', description: 'Dohvat demografskih podataka pacijenta putem MBO-a (IHE PDQm).', endpoint: `/api/patient/search?mbo=${PATIENT_MBO}`, method: 'GET', status: 'idle' },
                { id: 'tc-11', title: 'TC11 — Registracija stranca (PMIR)', description: 'Registracija pacijenta s EU karticom (IHE PMIR).', endpoint: '/api/patient/register-foreigner', method: 'POST', status: 'skip', skipReason: 'Zahtijeva testne podatke stranca (putovnica ili EKZO kartica)' },
            ]
        },
        {
            name: 'Posjeti i Slučajevi',
            icon: Layout,
            cases: [
                { id: 'tc-15', title: 'TC15 — Dohvat slučajeva (QEDm)', description: 'Pretraživanje aktivnih epizoda liječenja za pacijenta.', endpoint: `/api/case/patient/${PATIENT_MBO}?refresh=true`, method: 'GET', status: 'idle' },
                { id: 'tc-16', title: 'TC16 — Kreiranje slučaja (EpisodeOfCare)', description: 'Kreiranje nove epizode skrbi na CEZIH sustavu.', endpoint: '/api/case/create', method: 'POST', status: 'idle' },
                { id: 'tc-17', title: 'TC17 — Ažuriranje slučaja', description: 'Ažuriranje dijagnoze i statusa aktivne epizode.', endpoint: '/api/case/:id', method: 'PUT', status: 'idle' },
                { id: 'tc-12', title: 'TC12 — Otvaranje posjete', description: 'Slanje FHIR poruke za početak ambulantnog pregleda (ENCOUNTER_START).', endpoint: '/api/visit/create', method: 'POST', status: 'idle' },
                { id: 'tc-13', title: 'TC13 — Izmjena posjete', description: 'Ažuriranje podataka aktivnog posjeta (dijagnoza, status).', endpoint: '/api/visit/:id', method: 'PUT', status: 'idle' },
                { id: 'tc-14', title: 'TC14 — Zatvaranje posjete', description: 'Slanje konačnog statusa posjeta — REALIZATION poruka.', endpoint: '/api/visit/:id/close', method: 'POST', status: 'idle' },
            ]
        },
        {
            name: 'Medicinska Dokumentacija',
            icon: FileText,
            cases: [
                { id: 'tc-18', title: 'TC18 — Slanje dokumenta (ITI-65)', description: 'Slanje strukturiranog medicinskog nalaza u MHD repozitorij.', endpoint: '/api/document/send', method: 'POST', status: 'idle' },
                { id: 'tc-19', title: 'TC19 — Zamjena dokumenta', description: 'Slanje nove verzije nalaza kojom se povlači prethodna.', endpoint: '/api/document/replace', method: 'POST', status: 'idle' },
                { id: 'tc-20', title: 'TC20 — Storno dokumenta', description: 'Povlačenje nalaza poslanog greškom (Entered-in-error).', endpoint: '/api/document/cancel', method: 'POST', status: 'idle' },
                { id: 'tc-21', title: 'TC21 — Pretraga dokumenata (ITI-67)', description: '⚠️ Lokalna pretraga — dohvaća dokumente iz lokalnog DB-a, ne iz CEZIH repozitorija.', endpoint: `/api/document/search?patientMbo=${PATIENT_MBO}`, method: 'GET', status: 'idle' },
                { id: 'tc-22', title: 'TC22 — Dohvat dokumenta (ITI-68)', description: '⚠️ Lokalni dohvat — čita sadržaj dokumenta iz lokalnog DB-a, ne iz CEZIH repozitorija.', endpoint: '/api/document/retrieve?url=...', method: 'GET', status: 'idle' },
            ]
        },
    ];
}

// ─────────────────────────────────────────────────────────────────
// Test runner logic
// ─────────────────────────────────────────────────────────────────
async function runTC(id: string, groups: TCGroup[]): Promise<TCResult> {
    const start = Date.now();
    const BASE = '/api';

    const post = async (path: string, body: any) => {
        const r = await fetch(`${BASE}${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        return { httpStatus: r.status, response: await r.json().catch(() => null) };
    };

    const get = async (path: string) => {
        const r = await fetch(`${BASE}${path}`);
        return { httpStatus: r.status, response: await r.json().catch(() => null) };
    };

    // Find shared state from previous TC results in current session
    const findResult = (tcId: string) => {
        for (const g of groups) {
            const tc = g.cases.find(c => c.id === tcId);
            if (tc?.result) return tc.result;
        }
        return null;
    };

    let req: any = undefined;
    let res: { httpStatus: number; response: any };

    switch (id) {
        case 'tc-3': {
            req = {};
            res = await post('/auth/system-token', req);
            break;
        }
        case 'tc-6': {
            req = { quantity: 1 };
            res = await post('/oid/generate', req);
            break;
        }
        case 'tc-7':
        case 'tc-8': {
            req = {};
            res = await post('/terminology/sync', req);
            break;
        }
        case 'tc-9': {
            req = undefined;
            res = await get('/registry/organizations');
            break;
        }
        case 'tc-10': {
            req = undefined;
            res = await get(`/patient/search?mbo=${PATIENT_MBO}`);
            break;
        }
        case 'tc-15': {
            req = undefined;
            res = await get(`/case/patient/${PATIENT_MBO}?refresh=true`);
            break;
        }
        case 'tc-16': {
            req = {
                patientMbo: PATIENT_MBO,
                title: `Test slučaj ${new Date().toISOString().slice(0, 10)}`,
                diagnosisCode: 'M17.1',
                diagnosisDisplay: 'Druga primarna gonartroza',
                practitionerId: PRACTITIONER_OIB,
                organizationId: ORGANIZATION_ID,
                startDate: new Date().toISOString(),
            };
            res = await post('/case/create', req);
            break;
        }
        case 'tc-17': {
            // Use first available case
            const casesRes = await get(`/case/patient/${PATIENT_MBO}`);
            const caseId = casesRes.response?.cases?.[0]?.id;
            if (!caseId) {
                return { httpStatus: 0, request: {}, response: { error: 'Nema dostupnog caseId — pokrenite TC15 ili TC16 prvo' }, durationMs: Date.now() - start };
            }
            req = { patientMbo: PATIENT_MBO, status: 'active', diagnosisCode: 'M17.1', diagnosisDisplay: `Gonartroza — test ${new Date().toISOString().slice(11, 19)}` };
            res = await (async () => {
                const r = await fetch(`${BASE}/case/${caseId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req) });
                return { httpStatus: r.status, response: await r.json().catch(() => null) };
            })();
            break;
        }
        case 'tc-12': {
            req = {
                patientMbo: PATIENT_MBO,
                practitionerId: PRACTITIONER_OIB,
                organizationId: ORGANIZATION_ID,
                startDate: new Date().toISOString(),
                class: 'AMB',
            };
            res = await post('/visit/create', req);
            break;
        }
        case 'tc-13': {
            const visitId = findResult('tc-12')?.response?.result?.localVisitId;
            if (!visitId) {
                return { httpStatus: 0, request: {}, response: { error: 'Nema visitId — pokrenite TC12 prvo' }, durationMs: Date.now() - start };
            }
            req = { patientMbo: PATIENT_MBO, diagnosisCode: 'M17.1', diagnosisDisplay: 'Gonarthrosis' };
            res = await (async () => {
                const r = await fetch(`${BASE}/visit/${visitId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req) });
                return { httpStatus: r.status, response: await r.json().catch(() => null) };
            })();
            break;
        }
        case 'tc-14': {
            const visitId = findResult('tc-12')?.response?.result?.localVisitId;
            if (!visitId) {
                return { httpStatus: 0, request: {}, response: { error: 'Nema visitId — pokrenite TC12 prvo' }, durationMs: Date.now() - start };
            }
            req = { patientMbo: PATIENT_MBO, endDate: new Date().toISOString() };
            res = await post(`/visit/${visitId}/close`, req);
            break;
        }
        case 'tc-18': {
            const visitId = findResult('tc-12')?.response?.result?.localVisitId;
            req = {
                patientMbo: PATIENT_MBO,
                visitId: visitId || undefined,
                practitionerId: PRACTITIONER_OIB,
                organizationId: ORGANIZATION_ID,
                type: 'discharge-summary',
                title: 'Otpusno pismo — test',
                diagnosisCode: 'M17.1',
                diagnosisDisplay: 'Gonartroza',
                anamnesis: 'Pacijent se javlja radi boli u koljenu.',
                finding: 'Gonartroza desnog koljena stupnja II.',
                recommendation: 'Fizikalna terapija.',
                date: new Date().toISOString(),
            };
            res = await post('/document/send', req);
            break;
        }
        case 'tc-19': {
            const listRes = await get(`/document/search?patientMbo=${PATIENT_MBO}`);
            const sentDoc = listRes.response?.documents?.find((d: any) => d.status === 'sent');
            if (!sentDoc) {
                return { httpStatus: 0, request: {}, response: { error: 'Nema sent dokumenta — pokrenite TC18 prvo' }, durationMs: Date.now() - start };
            }
            req = {
                originalDocumentOid: sentDoc.id,
                patientMbo: PATIENT_MBO,
                visitId: sentDoc.visitId || undefined,
                practitionerId: PRACTITIONER_OIB,
                organizationId: ORGANIZATION_ID,
                type: sentDoc.type || 'discharge-summary',
                title: 'Zamjenski nalaz — test',
                diagnosisCode: sentDoc.diagnosisCode || 'M17.1',
                diagnosisDisplay: sentDoc.diagnosisDisplay || 'Gonartroza',
                finding: 'Ažurirani nalaz.',
                date: new Date().toISOString(),
            };
            res = await post('/document/replace', req);
            break;
        }
        case 'tc-20': {
            const listRes = await get(`/document/search?patientMbo=${PATIENT_MBO}`);
            const sentDoc = listRes.response?.documents?.find((d: any) => d.status === 'sent');
            if (!sentDoc) {
                return { httpStatus: 0, request: {}, response: { error: 'Nema sent dokumenta za storno' }, durationMs: Date.now() - start };
            }
            req = { documentOid: sentDoc.id };
            res = await post('/document/cancel', req);
            break;
        }
        case 'tc-21': {
            req = undefined;
            res = await get(`/document/search?patientMbo=${PATIENT_MBO}`);
            break;
        }
        case 'tc-22': {
            const listRes = await get(`/document/search?patientMbo=${PATIENT_MBO}`);
            const doc = listRes.response?.documents?.[0];
            if (!doc) {
                return { httpStatus: 0, request: {}, response: { error: 'Nema dokumenata u lokalnom DB' }, durationMs: Date.now() - start };
            }
            const url = encodeURIComponent(`urn:oid:${doc.id}`);
            req = { url: `urn:oid:${doc.id}` };
            res = await get(`/document/retrieve?url=${url}`);
            break;
        }
        default:
            return { httpStatus: 0, request: {}, response: { error: `Nepoznat TC: ${id}` }, durationMs: 0 };
    }

    const durationMs = Date.now() - start;
    // API wraps result in { success, result: { localOnly, cezihStatus, cezihError } }
    const inner = res.response?.result ?? res.response;
    const localOnly = inner?.localOnly === true || inner?.cezihStatus === 'failed';
    const cezihError = inner?.cezihError;

    return { httpStatus: res.httpStatus, request: req, response: res.response, durationMs, localOnly, cezihError };
}

function resolveStatus(id: string, result: TCResult): TCStatus {
    const code = result.httpStatus ?? 0;
    if (id === 'tc-7' || id === 'tc-8') {
        return code === 200 ? 'passed' : 'failed';
    }
    // TC21/TC22 su lokalni DB read — nisu pravi CEZIH pozivi
    if (id === 'tc-21' || id === 'tc-22') {
        return code === 200 ? 'local' : 'failed';
    }
    if (code === 0) return 'failed';
    if (code >= 200 && code < 300) {
        // Check both top-level and nested result for failure indicators
        const inner = result.response?.result ?? result.response;
        if (result.response?.success === false) return 'failed';
        if (result.localOnly || inner?.localOnly === true || inner?.cezihStatus === 'failed') return 'local';
        return 'passed';
    }
    return 'failed';
}

// ─────────────────────────────────────────────────────────────────
// UI Components
// ─────────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: TCStatus }) {
    const cfg: Record<TCStatus, { label: string; cls: string; icon: React.ReactNode }> = {
        idle: { label: 'Čeka', cls: 'bg-slate-100 text-slate-500', icon: <div className="w-3 h-3 rounded-full border-2 border-slate-300" /> },
        running: { label: 'Izvršava...', cls: 'bg-blue-100 text-blue-700', icon: <Clock className="w-3 h-3 animate-spin" /> },
        passed: { label: 'PROŠAO', cls: 'bg-emerald-100 text-emerald-700', icon: <CheckCircle className="w-3 h-3" /> },
        local: { label: 'LOKALNI', cls: 'bg-amber-100 text-amber-700', icon: <AlertTriangle className="w-3 h-3" /> },
        failed: { label: 'PALO', cls: 'bg-rose-100 text-rose-700', icon: <XCircle className="w-3 h-3" /> },
        skip: { label: 'SKIP', cls: 'bg-slate-100 text-slate-400', icon: <Info className="w-3 h-3" /> },
    };
    const c = cfg[status];
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${c.cls}`}>
            {c.icon}{c.label}
        </span>
    );
}

function HttpBadge({ code }: { code?: number }) {
    if (!code) return null;
    const cls = code >= 200 && code < 300 ? 'bg-emerald-100 text-emerald-700'
        : code === 403 ? 'bg-orange-100 text-orange-700'
            : code >= 400 ? 'bg-rose-100 text-rose-700'
                : 'bg-slate-100 text-slate-500';
    return <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${cls}`}>HTTP {code}</span>;
}

function JsonBlock({ data, label }: { data: any; label: string }) {
    const [expanded, setExpanded] = useState(false);
    if (data === undefined || data === null) return null;
    const json = JSON.stringify(data, null, 2);
    const lines = json.split('\n').length;
    const preview = lines > 30 && !expanded ? json.split('\n').slice(0, 30).join('\n') + '\n...' : json;
    return (
        <div className="mt-2">
            <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-1">{label}</div>
            <pre className="text-[10px] text-slate-300 bg-slate-900 rounded-lg p-3 overflow-x-auto leading-relaxed whitespace-pre-wrap break-words max-h-64 overflow-y-auto">
                {preview}
            </pre>
            {lines > 30 && (
                <button onClick={() => setExpanded(e => !e)} className="text-[10px] text-blue-400 hover:text-blue-300 mt-1">
                    {expanded ? '▲ Manje' : `▼ Prikaži sve (${lines} linija)`}
                </button>
            )}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────
export default function CertificationPage() {
    const [groups, setGroups] = useState<TCGroup[]>(buildGroups());
    const [activeGroup, setActiveGroup] = useState(0);
    const [expandedTCs, setExpandedTCs] = useState<Set<string>>(new Set());
    const [runningAll, setRunningAll] = useState(false);
    const [authStatus, setAuthStatus] = useState<{ authenticated: boolean; checked: boolean }>({ authenticated: false, checked: false });
    const [printDate, setPrintDate] = useState('');
    const groupsRef = useRef(groups);
    groupsRef.current = groups;

    const checkAuth = useCallback(async () => {
        try {
            const r = await fetch('/api/auth/status');
            const d = await r.json();
            setAuthStatus({ authenticated: d.authenticated, checked: true });
        } catch {
            setAuthStatus({ authenticated: false, checked: true });
        }
    }, []);

    // Set print date on client only (avoids SSR hydration mismatch)
    useEffect(() => {
        setPrintDate(new Date().toLocaleString('hr-HR'));
        checkAuth();
    }, [checkAuth]);

    const updateTC = useCallback((id: string, status: TCStatus, result?: TCResult) => {
        setGroups(prev => prev.map(g => ({
            ...g,
            cases: g.cases.map(tc => tc.id === id ? { ...tc, status, result } : tc)
        })));
    }, []);

    const runSingle = useCallback(async (id: string) => {
        const tc = groupsRef.current.flatMap(g => g.cases).find(c => c.id === id);
        if (!tc || tc.status === 'skip') return;
        updateTC(id, 'running');
        try {
            const result = await runTC(id, groupsRef.current);
            const status = resolveStatus(id, result);
            updateTC(id, status, result);
            // Auto-expand on failure
            if (status === 'failed' || status === 'local') {
                setExpandedTCs(prev => new Set([...prev, id]));
            }
        } catch (e: any) {
            updateTC(id, 'failed', { httpStatus: 0, request: {}, response: { error: e.message }, durationMs: 0 });
        }
    }, [updateTC]);

    const runGroup = useCallback(async (groupIdx: number) => {
        const cases = groupsRef.current[groupIdx].cases.filter(tc => tc.status !== 'skip');
        for (const tc of cases) {
            await runSingle(tc.id);
        }
    }, [runSingle]);

    const runAll = useCallback(async () => {
        setRunningAll(true);
        await checkAuth();
        for (const group of groupsRef.current) {
            for (const tc of group.cases) {
                if (tc.status !== 'skip') await runSingle(tc.id);
            }
        }
        setRunningAll(false);
    }, [runSingle, checkAuth]);

    const toggleExpand = (id: string) => {
        setExpandedTCs(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const allCases = groups.flatMap(g => g.cases);
    const passed = allCases.filter(c => c.status === 'passed').length;
    const local = allCases.filter(c => c.status === 'local').length;
    const failed = allCases.filter(c => c.status === 'failed').length;
    const skip = allCases.filter(c => c.status === 'skip').length;
    const idle = allCases.filter(c => c.status === 'idle').length;

    const currentGroup = groups[activeGroup];
    const groupPassed = currentGroup.cases.filter(c => c.status === 'passed').length;
    const groupLocal = currentGroup.cases.filter(c => c.status === 'local').length;
    const groupFailed = currentGroup.cases.filter(c => c.status === 'failed').length;

    return (
        <div className="flex flex-col h-full gap-0 print:h-auto">
            {/* ── Header ── */}
            <div className="print:hidden flex flex-col gap-3 pb-4">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900">FHIR Certification Test Bench</h1>
                        <p className="text-slate-500 text-sm mt-0.5">22 testna scenarija — CEZIH certifikacija privatnika</p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                        {/* Auth Status */}
                        <button
                            onClick={checkAuth}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${authStatus.checked
                                ? authStatus.authenticated
                                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                    : 'border-amber-200 bg-amber-50 text-amber-700'
                                : 'border-slate-200 bg-slate-50 text-slate-500'
                                }`}
                            title="Provjeri status gateway sesije"
                        >
                            {authStatus.authenticated ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                            {authStatus.checked
                                ? authStatus.authenticated ? 'Gateway sesija aktivna' : 'Gateway sesija neaktivna'
                                : 'Provjeri sesiju'}
                            <RefreshCw className="w-3 h-3 opacity-50" />
                        </button>

                        {/* Summary badges */}
                        {passed > 0 && <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold">✅ {passed} Prošlo</span>}
                        {local > 0 && <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 text-xs font-bold">⚠️ {local} Lokalni</span>}
                        {failed > 0 && <span className="px-2.5 py-1 rounded-full bg-rose-100 text-rose-700 text-xs font-bold">❌ {failed} Palo</span>}
                        {idle > 0 && <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 text-xs font-bold">⏳ {idle} Čeka</span>}
                        {skip > 0 && <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-400 text-xs font-bold">⚙️ {skip} Skip</span>}

                        {/* PDF */}
                        <button
                            onClick={() => { setExpandedTCs(new Set(allCases.map(c => c.id))); setTimeout(() => window.print(), 200); }}
                            className="flex items-center gap-1.5 border border-slate-200 hover:border-slate-400 text-slate-600 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                        >
                            <Printer className="w-3.5 h-3.5" /> PDF
                        </button>

                        {/* Run All */}
                        <button
                            onClick={runAll}
                            disabled={runningAll}
                            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-1.5 rounded-lg text-xs font-bold shadow-lg shadow-blue-200 transition-all"
                        >
                            <Play className="w-3.5 h-3.5 fill-current" />
                            {runningAll ? 'Izvršavam...' : 'Pokreni sve'}
                        </button>
                    </div>
                </div>

                {/* Gateway warning */}
                {authStatus.checked && !authStatus.authenticated && (
                    <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-xs text-amber-800">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        <span><strong>Gateway sesija nije aktivna.</strong> TC18, TC19, TC20 radit će samo lokalno (⚠️ LOKALNI). Za pravi CEZIH test trebate se prijaviti pametnom karticom.</span>
                    </div>
                )}
            </div>

            {/* Print header */}
            <div className="hidden print:block mb-6">
                <h1 className="text-xl font-bold">CEZIH FHIR — Certifikacijski test</h1>
                <p className="text-sm text-gray-500" suppressHydrationWarning>
                    Datum: {printDate || '—'} | Gateway sesija: {authStatus.authenticated ? 'Aktivna' : 'Neaktivna'}
                </p>
                <div className="flex gap-4 mt-2 text-sm font-semibold">
                    <span className="text-green-700">✅ Prošlo: {passed}</span>
                    <span className="text-amber-700">⚠️ Lokalni: {local}</span>
                    <span className="text-red-700">❌ Palo: {failed}</span>
                    <span className="text-gray-500">⚙️ Skip: {skip}</span>
                </div>
            </div>

            {/* ── Group Tabs ── */}
            <div className="print:hidden flex gap-1 overflow-x-auto pb-1 border-b border-slate-100 mb-4">
                {groups.map((g, i) => {
                    const gp = g.cases.filter(c => c.status === 'passed').length;
                    const gl = g.cases.filter(c => c.status === 'local').length;
                    const gf = g.cases.filter(c => c.status === 'failed').length;
                    return (
                        <button
                            key={i}
                            onClick={() => setActiveGroup(i)}
                            className={`flex items-center gap-1.5 px-3 py-2 rounded-t-lg text-xs font-semibold whitespace-nowrap transition-all border-b-2 ${activeGroup === i
                                ? 'border-blue-500 text-blue-700 bg-blue-50'
                                : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                                }`}
                        >
                            <g.icon className="w-3.5 h-3.5" />
                            {g.name}
                            <span className="flex gap-0.5">
                                {gp > 0 && <span className="w-4 h-4 rounded-full bg-emerald-500 text-white text-[8px] flex items-center justify-center font-bold">{gp}</span>}
                                {gl > 0 && <span className="w-4 h-4 rounded-full bg-amber-500 text-white text-[8px] flex items-center justify-center font-bold">{gl}</span>}
                                {gf > 0 && <span className="w-4 h-4 rounded-full bg-rose-500 text-white text-[8px] flex items-center justify-center font-bold">{gf}</span>}
                            </span>
                        </button>
                    );
                })}
            </div>

            {/* ── Group header with run button ── */}
            <div className="print:hidden flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                    <currentGroup.icon className="w-4 h-4 text-slate-400" />
                    {currentGroup.name}
                    <span className="text-slate-400 font-normal text-xs">({currentGroup.cases.length} TC-ova)</span>
                    {groupPassed > 0 && <span className="text-xs text-emerald-600">✅ {groupPassed}</span>}
                    {groupLocal > 0 && <span className="text-xs text-amber-600">⚠️ {groupLocal}</span>}
                    {groupFailed > 0 && <span className="text-xs text-rose-600">❌ {groupFailed}</span>}
                </div>
                <button
                    onClick={() => runGroup(activeGroup)}
                    disabled={runningAll}
                    className="flex items-center gap-1.5 bg-slate-700 hover:bg-slate-900 disabled:opacity-40 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
                >
                    <Play className="w-3 h-3 fill-current" /> Pokreni grupu
                </button>
            </div>

            {/* ── TC List (active group) ── */}
            <div className="flex-1 overflow-y-auto print:overflow-visible space-y-2 print:hidden">
                {currentGroup.cases.map(tc => {
                    const isExp = expandedTCs.has(tc.id);
                    const rowCls = tc.status === 'passed' ? 'border-emerald-100 bg-emerald-50/40'
                        : tc.status === 'local' ? 'border-amber-100 bg-amber-50/40'
                            : tc.status === 'failed' ? 'border-rose-100 bg-rose-50/30'
                                : tc.status === 'skip' ? 'border-slate-100 bg-slate-50/50 opacity-70'
                                    : 'border-slate-100 bg-white';
                    return (
                        <div key={tc.id} className={`rounded-xl border transition-all ${rowCls}`}>
                            {/* Row header */}
                            <div className="flex items-center gap-3 px-4 py-3">
                                <button onClick={() => toggleExpand(tc.id)} className="shrink-0 text-slate-400 hover:text-slate-600 transition-colors">
                                    {isExp ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                </button>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-bold text-slate-900 text-sm">{tc.title}</span>
                                        <StatusBadge status={tc.status} />
                                        {tc.result?.httpStatus && <HttpBadge code={tc.result.httpStatus} />}
                                        {tc.result?.durationMs && <span className="text-[10px] text-slate-400">{tc.result.durationMs}ms</span>}
                                    </div>
                                    <p className="text-xs text-slate-500 mt-0.5 truncate">{tc.description}</p>
                                    {tc.status === 'skip' && tc.skipReason && (
                                        <p className="text-[10px] text-slate-400 mt-0.5 italic">⚙️ {tc.skipReason}</p>
                                    )}
                                    {tc.status === 'local' && tc.result?.cezihError && (
                                        <p className="text-[10px] text-amber-700 mt-0.5">⚠️ CEZIH odbio: {tc.result.cezihError}</p>
                                    )}
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <span className="text-[9px] font-mono text-slate-400 hidden lg:block">
                                        <span className={`font-bold ${tc.method === 'GET' ? 'text-sky-600' : tc.method === 'PUT' ? 'text-amber-600' : 'text-violet-600'}`}>{tc.method}</span>
                                        {' '}{tc.endpoint.length > 35 ? tc.endpoint.slice(0, 35) + '…' : tc.endpoint}
                                    </span>
                                    <button
                                        onClick={() => runSingle(tc.id)}
                                        disabled={tc.status === 'running' || runningAll}
                                        className="text-[10px] font-bold px-3 py-1 rounded-lg bg-slate-100 hover:bg-blue-600 hover:text-white text-slate-600 transition-all disabled:opacity-30"
                                    >
                                        {tc.status === 'running' ? '⟳' : '▶ Run'}
                                    </button>
                                </div>
                            </div>

                            {/* Expanded details */}
                            {isExp && tc.result && (
                                <div className="px-4 pb-4 border-t border-slate-100 mt-1 pt-3">
                                    <div className="text-[9px] font-mono text-slate-400 mb-2">
                                        <span className={`font-bold ${tc.method === 'GET' ? 'text-sky-500' : tc.method === 'PUT' ? 'text-amber-500' : 'text-violet-500'}`}>{tc.method}</span>
                                        {' '}{tc.endpoint}
                                    </div>
                                    {tc.status === 'local' && (
                                        <div className="mb-3 p-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                                            ⚠️ <strong>Lokalni odgovor</strong> — dokument je spreman lokalno ali <strong>nije stigao na CEZIH</strong>.
                                            {tc.result.cezihError && <> CEZIH greška: <code className="font-mono bg-amber-100 px-1 rounded">{tc.result.cezihError}</code></>}
                                        </div>
                                    )}
                                    <JsonBlock data={tc.result.request} label="Request Body" />
                                    <JsonBlock data={tc.result.response} label="Response" />
                                </div>
                            )}

                            {/* Expanded skip details */}
                            {isExp && tc.status === 'skip' && (
                                <div className="px-4 pb-4 border-t border-slate-100 mt-1 pt-3">
                                    <p className="text-xs text-slate-500">⚙️ Ovaj test nije moguće automatski pokrenuti.</p>
                                    <p className="text-xs text-slate-400 mt-1"><strong>Razlog:</strong> {tc.skipReason}</p>
                                    <p className="text-xs text-slate-400 mt-1"><strong>Endpoint:</strong> <code className="font-mono bg-slate-100 px-1 rounded">{tc.method} {tc.endpoint}</code></p>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* ── Print View — All Groups ── */}
            <div className="hidden print:block space-y-8">
                {groups.map((g, gi) => (
                    <div key={gi} className="break-inside-avoid-page">
                        <h2 className="text-base font-bold border-b pb-1 mb-3 flex items-center gap-2">
                            {g.name}
                        </h2>
                        <div className="space-y-4">
                            {g.cases.map(tc => (
                                <div key={tc.id} className="border rounded p-3 break-inside-avoid">
                                    <div className="flex items-center justify-between">
                                        <span className="font-bold text-sm">{tc.title}</span>
                                        <div className="flex items-center gap-2">
                                            {tc.result?.httpStatus && <span className="text-xs font-mono">HTTP {tc.result.httpStatus}</span>}
                                            <span className="text-xs font-bold">
                                                {tc.status === 'passed' ? '✅ PROŠAO' : tc.status === 'local' ? '⚠️ LOKALNI' : tc.status === 'failed' ? '❌ PALO' : tc.status === 'skip' ? '⚙️ SKIP' : '⏳ Nije testirano'}
                                            </span>
                                        </div>
                                    </div>
                                    <p className="text-xs text-gray-500 mt-1">{tc.description}</p>
                                    {tc.skipReason && <p className="text-xs text-gray-400 mt-1 italic">Razlog: {tc.skipReason}</p>}
                                    {tc.status === 'local' && tc.result?.cezihError && (
                                        <p className="text-xs text-amber-700 mt-1">CEZIH greška: {tc.result.cezihError}</p>
                                    )}
                                    {tc.result?.request && (
                                        <div className="mt-2">
                                            <div className="text-[9px] font-bold uppercase text-gray-400 mb-0.5">Request</div>
                                            <pre className="text-[9px] font-mono bg-gray-50 border rounded p-2 overflow-auto max-h-32 whitespace-pre-wrap break-words">{JSON.stringify(tc.result.request, null, 2)}</pre>
                                        </div>
                                    )}
                                    {tc.result?.response && (
                                        <div className="mt-2">
                                            <div className="text-[9px] font-bold uppercase text-gray-400 mb-0.5">Response</div>
                                            <pre className="text-[9px] font-mono bg-gray-50 border rounded p-2 overflow-auto max-h-32 whitespace-pre-wrap break-words">{JSON.stringify(tc.result.response, null, 2)}</pre>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
