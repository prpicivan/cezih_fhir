'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { FileText, RefreshCw, XCircle, Search, Eye, Filter } from 'lucide-react';

export default function DocumentsPage() {
    const [documents, setDocuments] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');

    const fetchDocuments = () => {
        setLoading(true);
        // Use empty params to get all
        const queryParams = new URLSearchParams();
        if (getMboFromSearch(searchTerm)) queryParams.append('patientMbo', getMboFromSearch(searchTerm));
        if (statusFilter !== 'all') queryParams.append('status', statusFilter);

        fetch(`/api/document/search?${queryParams.toString()}`)
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    setDocuments(data.documents);
                }
                setLoading(false);
            })
            .catch(err => {
                console.error('Failed to fetch documents:', err);
                setLoading(false);
            });
    };

    useEffect(() => {
        fetchDocuments();
    }, [statusFilter]);

    const getMboFromSearch = (term: string) => {
        // Simple heuristic: if numeric and length 9, assume MBO
        return term.match(/^\d{9}$/) ? term : '';
    };

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        fetchDocuments();
    };

    const handleCancel = async (oid: string) => {
        if (!confirm('Jeste li sigurni da želite stornirati ovaj dokument?')) return;

        try {
            const res = await fetch('/api/document/cancel', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ documentOid: oid }),
            });
            const data = await res.json();
            if (data.success) {
                alert('Dokument uspješno storniran.');
                fetchDocuments();
            } else {
                alert('Greška: ' + data.error);
            }
        } catch (error) {
            alert('Greška pri komunikaciji sa serverom.');
        }
    };

    const handleReplace = (doc: any) => {
        // Redirect to workspace pre-filled for replacement?
        // Or simple prompt?
        // In a real scenario, this would check if a document can be replaced.
        // But we don't have that UI yet.
        // Let's stub it.
        alert('Za zamjenu dokumenta, idite na "Klinički rad", kreirajte novi dokument i odaberite opciju "Zamjena". (Not fully implemented in UI yet)');
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('hr-HR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'sent': return <span className="bg-green-100 text-green-800 px-2 py-1 rounded-full text-xs font-medium">Poslano</span>;
            case 'cancelled': return <span className="bg-red-100 text-red-800 px-2 py-1 rounded-full text-xs font-medium">Stornirano</span>;
            case 'replaced': return <span className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded-full text-xs font-medium">Zamijenjeno</span>;
            case 'current': return <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-xs font-medium">Aktivno</span>;
            default: return <span className="bg-gray-100 text-gray-800 px-2 py-1 rounded-full text-xs font-medium">{status}</span>;
        }
    };

    const [selectedDocument, setSelectedDocument] = useState<any>(null);

    const handlePreview = (doc: any) => {
        setSelectedDocument(doc);
    };

    const closePreview = () => {
        setSelectedDocument(null);
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Klinički Dokumenti</h1>
                    <p className="text-gray-600">Pregled svih poslanih dokumenata (e-Nalazi)</p>
                </div>
            </div>

            {/* Filters */}
            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col md:flex-row gap-4">
                <form onSubmit={handleSearch} className="flex-1 flex gap-2">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                        <input
                            type="text"
                            placeholder="Pretraži po MBO pacijenta..."
                            className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">Traži</button>
                </form>
                <div className="flex items-center gap-2">
                    <Filter className="w-4 h-4 text-gray-500" />
                    <select
                        className="border rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                    >
                        <option value="all">Svi statusi</option>
                        <option value="sent">Poslano</option>
                        <option value="cancelled">Stornirano</option>
                        <option value="replaced">Zamijenjeno</option>
                    </select>
                </div>
            </div>

            {/* Documents Table */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Datum</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tip Dokumenta</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Pacijent</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                            <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">OID</th>
                            <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Akcije</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {loading ? (
                            <tr><td colSpan={6} className="px-6 py-4 text-center text-gray-500">Učitavanje...</td></tr>
                        ) : documents.length === 0 ? (
                            <tr><td colSpan={6} className="px-6 py-4 text-center text-gray-500">Nema pronađenih dokumenata.</td></tr>
                        ) : (
                            documents.map((doc) => (
                                <tr key={doc.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{formatDate(doc.createdAt)}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{doc.type}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                        <div className="font-medium">{doc.firstName} {doc.lastName}</div>
                                        <div className="text-xs">{doc.patientMbo}</div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">{getStatusBadge(doc.status)}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-400 font-mono" title={doc.id}>{doc.id.substring(0, 15)}...</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium flex justify-end gap-2">
                                        {(doc.status === 'sent' || doc.status === 'current') && (
                                            <>
                                                <button onClick={() => handleReplace(doc)} className="text-blue-600 hover:text-blue-900" title="Zamijeni">
                                                    <RefreshCw className="w-4 h-4" />
                                                </button>
                                                <button onClick={() => handleCancel(doc.id)} className="text-red-600 hover:text-red-900" title="Storniraj">
                                                    <XCircle className="w-4 h-4" />
                                                </button>
                                            </>
                                        )}
                                        <button onClick={() => handlePreview(doc)} className="text-gray-400 hover:text-gray-600" title="Pregled">
                                            <Eye className="w-4 h-4" />
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Preview Modal */}
            {selectedDocument && (
                <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[80vh] flex flex-col">
                        <div className="p-4 border-b border-gray-100 flex justify-between items-center">
                            <h3 className="font-semibold text-lg flex items-center gap-2">
                                <FileText className="w-5 h-5 text-blue-600" />
                                Pregled Dokumenta
                            </h3>
                            <button onClick={closePreview} className="text-gray-400 hover:text-gray-600">
                                <XCircle className="w-6 h-6" />
                            </button>
                        </div>
                        <div className="p-6 overflow-y-auto space-y-4">
                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                    <span className="text-gray-500 block">Pacijent</span>
                                    <span className="font-medium">{selectedDocument.firstName} {selectedDocument.lastName} ({selectedDocument.patientMbo})</span>
                                </div>
                                <div>
                                    <span className="text-gray-500 block">Datum</span>
                                    <span className="font-medium">{formatDate(selectedDocument.createdAt)}</span>
                                </div>
                                <div>
                                    <span className="text-gray-500 block">Tip</span>
                                    <span className="font-medium bg-slate-100 px-2 py-0.5 rounded">{selectedDocument.type}</span>
                                </div>
                                <div>
                                    <span className="text-gray-500 block">Status</span>
                                    <span className="font-medium">{getStatusBadge(selectedDocument.status)}</span>
                                </div>
                                <div className="col-span-2">
                                    <span className="text-gray-500 block">Dokument OID (ID)</span>
                                    <span className="font-mono text-xs bg-slate-50 p-1 rounded block">{selectedDocument.id}</span>
                                </div>
                            </div>

                            <div className="border-t border-gray-100 pt-4">
                                <span className="text-gray-500 block mb-2 font-medium">Sadržaj dokumenta</span>
                                <div className="bg-slate-50 p-4 rounded-lg text-sm whitespace-pre-wrap font-serif border border-slate-200 min-h-[150px]">
                                    {selectedDocument.content || selectedDocument.data || "Nema tekstualnog sadržaja."}
                                </div>
                            </div>
                        </div>
                        <div className="p-4 border-t border-gray-100 bg-gray-50 rounded-b-xl flex justify-end">
                            <button onClick={closePreview} className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium text-sm">
                                Zatvori
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
