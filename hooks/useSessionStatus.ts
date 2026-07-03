'use client';

import { useCallback, useEffect, useState } from 'react';
import { signedFetch } from '@/lib/api/signedFetch';

export interface SessionChain {
    chainId: number;
    name: string;
}

export interface SessionStatus {
    registered: boolean;
    address?: string;
    approved: SessionChain[];
    pending: SessionChain[];
    needsAction: boolean;
}

/**
 * Polls /deposit/session-status so the dashboard knows whether to show a
 * "new chains available, please re-authorize" banner.
 *
 * - `needsAction === true` means the user has at least one active EVM chain
 *   their Rhinestone session doesn't cover yet. Use `useExtendSession` to
 *   walk them through the sign flow.
 * - For pre-registration users (`registered === false`) keep showing the
 *   normal "Enable Auto-Deposits" CTA; the initial registration signs every
 *   active chain in one go.
 */
export function useSessionStatus(autoFetch = true) {
    const [status, setStatus] = useState<SessionStatus | null>(null);
    const [loading, setLoading] = useState(autoFetch);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await signedFetch('/deposit/session-status', {
                auth: true,
                headers: { 'ngrok-skip-browser-warning': 'true' },
            });
            if (!res.ok) {
                const txt = await res.text();
                throw new Error(`Session status failed: ${res.status} ${txt}`);
            }
            const data = (await res.json()) as SessionStatus;
            setStatus(data);
            return data;
        } catch (err: any) {
            setError(err?.message || 'Failed to load session status');
            throw err;
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!autoFetch) return;
        refresh().catch(() => {
            // error state already set
        });
    }, [autoFetch, refresh]);

    return { status, loading, error, refresh };
}
