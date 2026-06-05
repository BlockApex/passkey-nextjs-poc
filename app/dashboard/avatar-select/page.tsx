'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { API_BASE, signedFetch } from '@/lib/api/signedFetch';

interface CuratedAvatar {
    _id: string;
    style: string;
    seed: string;
    label?: string;
    svgUrl: string;
}

export default function AvatarSelectPage() {
    const router = useRouter();
    const [avatars, setAvatars] = useState<CuratedAvatar[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [success, setSuccess] = useState('');
    const [error, setError] = useState('');

    useEffect(() => {
        const token = localStorage.getItem('accessToken');
        if (!token) {
            router.push('/');
            return;
        }
        fetchAvatars();
    }, []);

    const fetchAvatars = async () => {
        setLoading(true);
        try {
            const res = await signedFetch('/avatar/curated');
            if (res.ok) setAvatars(await res.json());
        } catch (e) {
            console.error('Failed to fetch avatars', e);
        } finally {
            setLoading(false);
        }
    };

    const handleSave = async () => {
        if (!selectedId) return;
        setSaving(true);
        setError('');
        setSuccess('');

        try {
            const res = await signedFetch('/onboarding/avatar', {
                method: 'PATCH',
                auth: true,
                json: { avatarId: selectedId },
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.message || 'Failed to set avatar');
            }

            setSuccess('Avatar updated!');
            setTimeout(() => router.push('/dashboard'), 1000);
        } catch (e: any) {
            setError(e.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
            <div className="max-w-3xl mx-auto px-6 py-8">
                {/* Header */}
                <div className="flex items-center gap-4 mb-8">
                    <button
                        onClick={() => router.push('/dashboard')}
                        className="p-2 rounded-lg hover:bg-slate-200 transition"
                    >
                        <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                        </svg>
                    </button>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900">Choose Your Avatar</h1>
                        <p className="text-sm text-slate-500">Pick an avatar to represent you on Handle</p>
                    </div>
                </div>

                {/* Avatar Grid */}
                {loading ? (
                    <div className="py-16 text-center text-slate-500">Loading avatars...</div>
                ) : avatars.length === 0 ? (
                    <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
                        <p className="text-slate-500 text-lg">No avatars available yet</p>
                        <p className="text-sm text-slate-400 mt-1">An admin needs to curate some avatars first</p>
                    </div>
                ) : (
                    <>
                        <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-4 mb-8">
                            {avatars.map((avatar) => (
                                <button
                                    key={avatar._id}
                                    onClick={() => setSelectedId(avatar._id)}
                                    className={`relative group aspect-square rounded-xl border-2 overflow-hidden transition-all hover:scale-105 ${
                                        selectedId === avatar._id
                                            ? 'border-emerald-500 ring-2 ring-emerald-200 shadow-lg'
                                            : 'border-slate-200 hover:border-slate-300'
                                    }`}
                                >
                                    <img
                                        src={`${API_BASE}${avatar.svgUrl}`}
                                        alt={avatar.label || avatar.seed}
                                        className="w-full h-full object-cover"
                                    />
                                    {selectedId === avatar._id && (
                                        <div className="absolute inset-0 bg-emerald-500/10 flex items-center justify-center">
                                            <div className="bg-emerald-500 text-white rounded-full p-1">
                                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                </svg>
                                            </div>
                                        </div>
                                    )}
                                    {avatar.label && (
                                        <p className="absolute bottom-0 inset-x-0 py-1 text-center text-xs bg-black/40 text-white truncate">
                                            {avatar.label}
                                        </p>
                                    )}
                                </button>
                            ))}
                        </div>

                        {error && <p className="mb-4 text-sm text-red-500 text-center">{error}</p>}
                        {success && <p className="mb-4 text-sm text-emerald-600 text-center">{success}</p>}

                        <div className="flex justify-center">
                            <button
                                onClick={handleSave}
                                disabled={!selectedId || saving}
                                className="px-8 py-3 bg-emerald-500 text-white rounded-lg font-semibold text-sm hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition"
                            >
                                {saving ? 'Saving...' : 'Set as My Avatar'}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
