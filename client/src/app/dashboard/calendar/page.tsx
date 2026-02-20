'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Calendar as CalendarIcon, Clock, User, Plus, MoveRight } from 'lucide-react';

export default function CalendarPage() {
    const [visits, setVisits] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch('/api/visit/all')
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    setVisits(data.visits);
                }
                setLoading(false);
            })
            .catch(err => {
                console.error('Failed to fetch visits:', err);
                setLoading(false);
            });
    }, []);

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('hr-HR', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
        });
    };

    const formatTime = (dateString: string) => {
        return new Date(dateString).toLocaleTimeString('hr-HR', {
            hour: '2-digit',
            minute: '2-digit',
        });
    };

    const today = new Date().toDateString();

    const todayVisits = visits.filter(v => new Date(v.startDateTime).toDateString() === today);
    const upcomingVisits = visits.filter(v => new Date(v.startDateTime) > new Date() && new Date(v.startDateTime).toDateString() !== today);
    const pastVisits = visits.filter(v => new Date(v.startDateTime) < new Date() && new Date(v.startDateTime).toDateString() !== today);

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Raspored (Calendar)</h1>
                    <p className="text-gray-600">Pregled naručenih pacijenata i termina</p>
                </div>
                <Link
                    href="/dashboard/patients"
                    className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition"
                >
                    <Plus className="w-4 h-4" />
                    Novi Termin
                </Link>
            </div>

            {loading ? (
                <div className="p-8 text-center text-gray-500">Učitavanje rasporeda...</div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Today's Schedule */}
                    <div className="lg:col-span-2 space-y-6">
                        <h2 className="text-xl font-semibold flex items-center gap-2">
                            <CalendarIcon className="w-5 h-5 text-blue-600" />
                            Danas, {new Date().toLocaleDateString('hr-HR')}
                        </h2>

                        {todayVisits.length === 0 ? (
                            <div className="bg-white p-6 rounded-xl border border-gray-200 text-center text-gray-500">
                                Nema zakazanih termina za danas.
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {todayVisits.map((visit) => (
                                    <div key={visit.id} className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex justify-between items-center hover:shadow-md transition">
                                        <div className="flex items-center gap-4">
                                            <div className="bg-blue-50 text-blue-600 p-3 rounded-lg flex flex-col items-center min-w-[80px]">
                                                <span className="text-lg font-bold">{formatTime(visit.startDateTime)}</span>
                                                <span className="text-xs uppercase">{visit.type === 'AMB' ? 'AMB' : 'HITNO'}</span>
                                            </div>
                                            <div>
                                                <h3 className="font-medium text-lg">{visit.firstName} {visit.lastName}</h3>
                                                <div className="flex items-center gap-2 text-sm text-gray-500">
                                                    <User className="w-3 h-3" />
                                                    MBO: {visit.patientMbo}
                                                </div>
                                                <div className="mt-1">
                                                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${visit.status === 'finished' ? 'bg-green-100 text-green-800' :
                                                            visit.status === 'in-progress' ? 'bg-blue-100 text-blue-800' :
                                                                'bg-gray-100 text-gray-800'
                                                        }`}>
                                                        {visit.status === 'finished' ? 'Završeno' :
                                                            visit.status === 'in-progress' ? 'U tijeku' : 'Planirano'}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                        <Link href={`/dashboard/visit/new?mbo=${visit.patientMbo}`} className="text-blue-600 hover:text-blue-800 p-2">
                                            <MoveRight className="w-5 h-5" />
                                        </Link>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Upcoming Section */}
                        <div className="mt-8">
                            <h2 className="text-xl font-semibold mb-4 text-gray-700">Nadolazeći termini</h2>
                            {upcomingVisits.length === 0 ? (
                                <p className="text-gray-500 italic">Nema nadolazećih termina.</p>
                            ) : (
                                <div className="space-y-3">
                                    {upcomingVisits.map((visit) => (
                                        <div key={visit.id} className="bg-white p-4 rounded-lg border border-gray-200 flex justify-between items-center">
                                            <div>
                                                <div className="text-sm text-gray-500 mb-1">{formatDate(visit.startDateTime)} u {formatTime(visit.startDateTime)}</div>
                                                <div className="font-medium">{visit.firstName} {visit.lastName}</div>
                                            </div>
                                            <div className="text-sm font-medium text-gray-600 px-3 py-1 bg-gray-100 rounded-full">
                                                {visit.type}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Past/History Sidebar */}
                    <div className="space-y-4">
                        <h2 className="text-lg font-semibold text-gray-700">Povijest</h2>
                        <div className="bg-gray-50 rounded-xl p-4 space-y-4 max-h-[600px] overflow-y-auto">
                            {pastVisits.length === 0 ? (
                                <p className="text-center text-gray-400 text-sm">Nema povijesti posjeta.</p>
                            ) : (
                                pastVisits.map((visit) => (
                                    <div key={visit.id} className="border-b border-gray-200 pb-3 last:border-0">
                                        <div className="text-xs text-gray-500">{formatDate(visit.startDateTime)}</div>
                                        <div className="font-medium text-sm mt-1">{visit.firstName} {visit.lastName}</div>
                                        <div className="flex justify-between items-center mt-1">
                                            <span className="text-xs bg-gray-200 px-2 py-0.5 rounded text-gray-600">{formatTime(visit.startDateTime)}</span>
                                            <span className={`text-xs ${visit.status === 'finished' ? 'text-green-600' : 'text-gray-500'}`}>
                                                {visit.status === 'finished' ? 'Završeno' : visit.status}
                                            </span>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
