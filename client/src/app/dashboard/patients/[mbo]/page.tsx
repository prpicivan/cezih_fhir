'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { FileText, Plus, XCircle, User, Calendar, FolderOpen, AlertCircle } from 'lucide-react';

export default function PatientHistoryPage() {
    const params = useParams();
    const mbo = params.mbo as string;

    const [patient, setPatient] = useState<any>(null);
    const [cases, setCases] = useState<any[]>([]);
    const [documents, setDocuments] = useState<any[]>([]);
    const [visits, setVisits] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Fetch Patient, Cases, Documents & Visits
    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            try {
                // 1. Fetch Patient
                const patientRes = await fetch(`/api/patient/search?mbo=${mbo}`);
                const patientData = await patientRes.json();
                if (patientData.success && patientData.patients.length > 0) {
                    setPatient(patientData.patients[0]);
                } else {
                    setError('Pacijent nije pronađen.');
                    setLoading(false);
                    return;
                }

                // 2. Fetch Cases
                const casesRes = await fetch(`/api/case/patient/${mbo}`);
                const casesData = await casesRes.json();
                if (casesData.success) setCases(casesData.cases);

                // 3. Fetch Documents
                const docsRes = await fetch(`/api/document/search?patientMbo=${mbo}`);
                const docsData = await docsRes.json();
                if (docsData.success) setDocuments(docsData.documents);

                // 4. Fetch Visits (Visits)
                const visitsRes = await fetch(`/api/visit/all?patientMbo=${mbo}`);
                const visitsData = await visitsRes.json();
                if (visitsData.success) setVisits(visitsData.visits);

            } catch (err: any) {
                console.error('Error fetching history:', err);
                setError('Greška pri dohvaćanju podataka.');
            } finally {
                setLoading(false);
            }
        };

        if (mbo) fetchData();
    }, [mbo]);

    const handleCreateCase = async () => {
        const title = prompt('Unesite naziv nove epizode liječenja (npr. "Pregled vida"):');
        if (!title) return;

        try {
            const res = await fetch('/api/case/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    patientMbo: mbo,
                    title: title,
                    practitionerId: 'Dr. Ivan Horvat', // Mock
                    organizationId: 'Poliklinika X' // Mock
                }),
            });
            const data = await res.json();
            if (data.success) {
                alert('Epizoda uspješno otvorena.');
                // Refresh
                window.location.reload();
            } else {
                alert('Greška: ' + data.error);
            }
        } catch (error) {
            alert('Greška pri komunikaciji.');
        }
    };

    const handleCloseCase = async (caseId: string) => {
        if (!confirm('Jeste li sigurni da želite zatvoriti ovu epizodu?')) return;

        try {
            const res = await fetch(`/api/case/${caseId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    status: 'finished',
                    outcome: 'Liječenje završeno'
                }),
            });
            const data = await res.json();
            if (data.success) {
                alert('Epizoda uspješno zatvorena.');
                window.location.reload();
            } else {
                alert('Greška: ' + data.error);
            }
        } catch (error) {
            alert('Greška pri komunikaciji.');
        }
    };

    if (loading) {
        return <div className="p-8 text-center text-gray-500">Učitavanje povijesti bolesti...</div>;
    }

    if (error || !patient) {
        return (
            <div className="p-8 text-center">
                <div className="text-red-500 font-bold mb-2">Greška</div>
                <p>{error}</p>
                <Link href="/dashboard/patients" className="text-blue-600 hover:underline mt-4 inline-block">
                    &larr; Natrag na popis pacijenata
                </Link>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex justify-between items-start">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <FolderOpen className="text-blue-600" />
                        Povijest Bolesti (TC 15)
                    </h1>
                    <div className="mt-2 text-gray-600">
                        <span className="font-semibold text-gray-800">{patient.name.given.join(' ')} {patient.name.family}</span>
                        <span className="mx-2">•</span>
                        <span>MBO: {patient.mbo}</span>
                        <span className="mx-2">•</span>
                        <span>{patient.birthDate}</span>
                    </div>
                </div>
                <Link
                    href="/dashboard/patients"
                    className="text-sm text-gray-500 hover:text-gray-900"
                >
                    &larr; Natrag
                </Link>
            </div>

            {/* Actions */}
            <div className="flex justify-end">
                <button
                    onClick={handleCreateCase}
                    className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
                >
                    <Plus className="w-4 h-4" />
                    Nova Epizoda (TC 16)
                </button>
            </div>

            {/* Visits Section */}
            <div className="space-y-4">
                <h2 className="text-lg font-semibold text-gray-800">Posjeti (Visits - TC 12-14)</h2>
                {visits.length === 0 ? (
                    <div className="bg-white p-6 rounded-xl border border-gray-200 text-center text-sm text-gray-500">
                        Nema zabilježenih posjeta.
                    </div>
                ) : (
                    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-gray-50 text-gray-500">
                                <tr>
                                    <th className="px-4 py-2">Datum</th>
                                    <th className="px-4 py-2">Doktor</th>
                                    <th className="px-4 py-2">Status</th>
                                    <th className="px-4 py-2">Tip</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {visits.map((vis) => (
                                    <tr key={vis.id} className="hover:bg-gray-50">
                                        <td className="px-4 py-2">{new Date(vis.startDateTime).toLocaleString('hr-HR')}</td>
                                        <td className="px-4 py-2 font-medium">{vis.doctorName}</td>
                                        <td className="px-4 py-2">
                                            <span className={`px-2 py-0.5 rounded-full text-xs ${vis.status === 'finished' ? 'bg-green-100 text-green-800' :
                                                    vis.status === 'in-progress' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100'
                                                }`}>
                                                {vis.status === 'finished' ? 'Završeno' :
                                                    vis.status === 'in-progress' ? 'U tijeku' : 'Planirano'}
                                            </span>
                                        </td>
                                        <td className="px-4 py-2 text-gray-500">{vis.type}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Cases Section */}
            <div className="space-y-4">
                <div className="flex justify-between items-center">
                    <h2 className="text-lg font-semibold text-gray-800">Epizode Liječenja (Care Plans)</h2>
                </div>
                {cases.length === 0 ? (
                    <p className="text-gray-500 italic text-sm">Nema otvorenih epizoda.</p>
                ) : (
                    <div className="grid gap-4">
                        {cases.map((c) => (
                            <div key={c.id} className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm flex justify-between">
                                <div>
                                    <h3 className="font-bold">{c.title}</h3>
                                    <div className="text-xs text-gray-500">Status: {c.status} | Od: {new Date(c.start).toLocaleDateString()}</div>
                                </div>
                                <button onClick={() => handleCloseCase(c.id)} className="text-xs text-red-600 border border-red-200 px-2 py-1 rounded hover:bg-red-50">Zatvori</button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Documents Section */}
            <div className="space-y-4 pt-6 border-t border-gray-200">
                <h2 className="text-lg font-semibold text-gray-800">Klinički Dokumenti (e-Nalazi)</h2>
                {documents.length === 0 ? (
                    <div className="bg-gray-50 p-6 rounded-xl border border-gray-200 text-center text-sm text-gray-500">
                        Nema izdanih dokumenata za ovog pacijenta.
                    </div>
                ) : (
                    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-gray-50 text-gray-500">
                                <tr>
                                    <th className="px-4 py-2">Datum</th>
                                    <th className="px-4 py-2">Tip</th>
                                    <th className="px-4 py-2">Status</th>
                                    <th className="px-4 py-2">ID</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {documents.map((doc) => (
                                    <tr key={doc.id} className="hover:bg-gray-50">
                                        <td className="px-4 py-2">{new Date(doc.createdAt).toLocaleDateString()}</td>
                                        <td className="px-4 py-2 font-medium">{doc.type}</td>
                                        <td className="px-4 py-2">
                                            <span className={`px-2 py-0.5 rounded-full text-xs ${doc.status === 'sent' ? 'bg-green-100 text-green-800' :
                                                doc.status === 'cancelled' ? 'bg-red-100 text-red-800' : 'bg-gray-100'
                                                }`}>
                                                {doc.status}
                                            </span>
                                        </td>
                                        <td className="px-4 py-2 text-xs text-gray-400 font-mono">{doc.id.substring(0, 8)}...</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
