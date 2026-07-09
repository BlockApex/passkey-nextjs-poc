'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useRhinestoneTransfer } from '@/hooks/useRhinestoneTransfer';

type Token = { symbol: string; address: string; decimals: number; chainId: number };

// A few known source assets to swap FROM (held in Spot).
const FROM_PRESETS: Token[] = [
    { symbol: 'USDC', address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', decimals: 6, chainId: 8453 }, // Base
    { symbol: 'USDT0', address: '0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb', decimals: 6, chainId: 9745 }, // Plasma
    { symbol: 'WETH', address: '0x4200000000000000000000000000000000000006', decimals: 18, chainId: 8453 }, // Base
];

/**
 * Isolated test screen for Swap — spend a supported asset from Spot, receive any
 * token (Rhinestone intent, orchestrator routes). Destination token entered by
 * address (as the real picker would supply it).
 */
export default function SwapPage() {
    const router = useRouter();
    const { activateSpotOnPlasma, quoteSwap, swapViaBackend, isSending, error } = useRhinestoneTransfer();

    const [accessToken, setAccessToken] = useState<string | null>(null);
    const [fromIdx, setFromIdx] = useState(0);
    const [amount, setAmount] = useState('');
    // destination (any token) — defaults to LINK on Base
    const [toSymbol, setToSymbol] = useState('LINK');
    const [toToken, setToToken] = useState('0x88Fb150BDc53A65fe94Dea0c9BA0a6dAf8C6e196');
    const [toDecimals, setToDecimals] = useState('18');
    const [toChainId, setToChainId] = useState('8453');
    const [result, setResult] = useState<{ hash: string } | null>(null);
    const [localError, setLocalError] = useState<string | null>(null);
    const [quote, setQuote] = useState<any>(null);
    const [quoting, setQuoting] = useState(false);

    useEffect(() => {
        const token = localStorage.getItem('accessToken');
        if (!token) { router.push('/'); return; }
        setAccessToken(token);
    }, [router]);

    const params = () => {
        const from = FROM_PRESETS[fromIdx];
        return {
            accessToken: accessToken!,
            fromToken: from.address, fromSymbol: from.symbol, fromDecimals: from.decimals, fromChainId: from.chainId,
            toToken: toToken.trim(), toSymbol: toSymbol.trim() || 'TOKEN',
            toDecimals: parseInt(toDecimals) || 18, toChainId: parseInt(toChainId) || from.chainId,
            amount: amount.trim(),
        };
    };

    const [activating, setActivating] = useState(false);
    const [activated, setActivated] = useState<string | null>(null);

    const handleActivate = async () => {
        setResult(null); setLocalError(null); setActivated(null);
        if (!accessToken) return;
        setActivating(true);
        try {
            const res = await activateSpotOnPlasma({ accessToken });
            setActivated(res.hash);
        } catch (e: any) {
            setLocalError(e?.message || 'Activation failed');
        } finally {
            setActivating(false);
        }
    };

    const handleQuote = async () => {
        setResult(null); setLocalError(null); setQuote(null);
        if (!accessToken) return;
        if (!amount || !toToken) { setLocalError('Amount and destination token required'); return; }
        setQuoting(true);
        try {
            setQuote(await quoteSwap(params()));
        } catch (e: any) {
            setLocalError(e?.message || 'Quote failed');
        } finally {
            setQuoting(false);
        }
    };

    const handleSwap = async () => {
        setResult(null);
        setLocalError(null);
        if (!accessToken) return;
        if (!amount || !toToken) { setLocalError('Amount and destination token required'); return; }
        try {
            const res = await swapViaBackend(params());
            setResult(res);
            setQuote(null);
        } catch (e: any) {
            setLocalError(e?.message || 'Swap failed');
        }
    };

    const shown = localError || error;
    const input = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-black';

    return (
        <div className="min-h-screen bg-slate-50 p-6">
            <div className="max-w-md mx-auto">
                <button onClick={() => router.push('/dashboard')} className="text-sm text-slate-500 hover:text-slate-700 mb-4">← Back</button>

                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                    <h1 className="text-xl font-bold text-slate-900">Swap</h1>
                    <p className="text-sm text-slate-500 mt-1">Spot · supported asset → any token · via Rhinestone intent</p>

                    {/* One-time: deploy + Permit2-approve the Spot account on Plasma so it can
                        be used as a swap source. Needed only for Plasma-held USDT0. */}
                    <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
                        <p className="text-xs text-amber-800">Sourcing from Plasma USDT0? Activate Spot on Plasma once first (deploys + approves it).</p>
                        <button onClick={handleActivate} disabled={activating || isSending} className="mt-2 w-full border border-amber-500 text-amber-800 hover:bg-amber-100 disabled:opacity-60 text-sm font-semibold rounded-lg py-2 transition">
                            {activating ? 'Activating…' : 'Activate Spot on Plasma (one-time)'}
                        </button>
                        {activated && (
                            <a href={`https://plasmascan.to/tx/${activated}`} target="_blank" rel="noreferrer" className="mt-2 block text-xs text-emerald-700 underline break-all">Activated ✓ {activated}</a>
                        )}
                    </div>

                    <label className="block text-sm font-medium text-slate-700 mt-6 mb-1">From (spend)</label>
                    <select value={fromIdx} onChange={(e) => setFromIdx(parseInt(e.target.value))} className={input}>
                        {FROM_PRESETS.map((t, i) => (
                            <option key={i} value={i}>{t.symbol} · chain {t.chainId}</option>
                        ))}
                    </select>

                    <label className="block text-sm font-medium text-slate-700 mt-4 mb-1">Amount</label>
                    <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="10" inputMode="decimal" className={input} />

                    <label className="block text-sm font-medium text-slate-700 mt-4 mb-1">To (receive any token)</label>
                    <div className="grid grid-cols-2 gap-2">
                        <input value={toSymbol} onChange={(e) => setToSymbol(e.target.value)} placeholder="LINK" className={input} />
                        <input value={toChainId} onChange={(e) => setToChainId(e.target.value)} placeholder="chainId (8453)" className={input} />
                    </div>
                    <input value={toToken} onChange={(e) => setToToken(e.target.value)} placeholder="0x token address" className={input + ' mt-2 font-mono text-xs'} />
                    <input value={toDecimals} onChange={(e) => setToDecimals(e.target.value)} placeholder="decimals (18)" className={input + ' mt-2'} />

                    <button onClick={handleQuote} disabled={quoting || isSending} className="w-full mt-6 border border-emerald-600 text-emerald-700 hover:bg-emerald-50 disabled:opacity-60 font-semibold rounded-lg py-3 transition">
                        {quoting ? 'Getting quote…' : 'Get quote'}
                    </button>

                    {quote && (
                        <div className="mt-4 bg-slate-50 border border-slate-200 rounded-lg p-4 text-sm text-slate-700">
                            {quote.quoteAvailable ? (
                                <>
                                    <div className="flex justify-between"><span>You&apos;ll receive ≈</span><span className="font-semibold text-slate-900">{quote.to.youReceive} {quote.to.symbol}</span></div>
                                    <div className="flex justify-between text-slate-500 mt-1"><span>Network + bridge cost</span><span>{quote.feeUsd != null ? `~$${quote.feeUsd.toFixed(4)} (included)` : 'included'}</span></div>
                                    <div className="flex justify-between text-slate-500 mt-1"><span>Gas</span><span>you pay none</span></div>
                                    <button onClick={handleSwap} disabled={isSending} className="w-full mt-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-semibold rounded-lg py-3 transition">
                                        {isSending ? 'Swapping…' : `Confirm swap`}
                                    </button>
                                </>
                            ) : (
                                <p className="text-amber-600">{quote.quoteReason || 'Couldn’t find a route for this swap.'}</p>
                            )}
                        </div>
                    )}

                    {shown && <div className="mt-4 bg-red-50 text-red-600 text-sm rounded-lg p-3 break-words">{shown}</div>}
                    {result && (
                        <div className="mt-4 bg-emerald-50 text-emerald-700 text-sm rounded-lg p-3">
                            <p className="font-semibold">Swapped ✓</p>
                            <a href={`https://plasmascan.to/tx/${result.hash}`} target="_blank" rel="noreferrer" className="font-mono text-xs underline break-all">{result.hash}</a>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
