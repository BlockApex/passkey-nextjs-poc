'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useRhinestoneTransfer } from '@/hooks/useRhinestoneTransfer';

type WalletType = 'money' | 'spot';

/** Block explorer tx URL by chainId (for the success link). */
function explorerTx(chainId: number, hash: string): string {
    const base: Record<number, string> = {
        9745: 'https://plasmascan.to/tx/',
        8453: 'https://basescan.org/tx/',
        42161: 'https://arbiscan.io/tx/',
        10: 'https://optimistic.etherscan.io/tx/',
        137: 'https://polygonscan.com/tx/',
        1: 'https://etherscan.io/tx/',
    };
    return (base[chainId] ?? 'https://blockscan.com/tx/') + hash;
}

/**
 * Isolated test screen for Withdraw — send funds OUT to an external EVM address.
 * Money withdraws USDT0 on Plasma; Spot withdraws the chosen asset on its own
 * chain (symbol + chainId). Same-chain, 0.1% fee deducted.
 */
export default function WithdrawPage() {
    const router = useRouter();
    const { withdrawViaBackend, isSending, error } = useRhinestoneTransfer();

    const [accessToken, setAccessToken] = useState<string | null>(null);
    const [walletType, setWalletType] = useState<WalletType>('money');
    const [toAddress, setToAddress] = useState('');
    const [amount, setAmount] = useState('');
    const [symbol, setSymbol] = useState('USDC');
    const [chainId, setChainId] = useState('8453');
    const [result, setResult] = useState<{ hash: string; chainId: number } | null>(null);
    const [localError, setLocalError] = useState<string | null>(null);

    useEffect(() => {
        const token = localStorage.getItem('accessToken');
        if (!token) { router.push('/'); return; }
        setAccessToken(token);
    }, [router]);

    const handleWithdraw = async () => {
        setResult(null);
        setLocalError(null);
        if (!accessToken) return;
        if (!toAddress) { setLocalError('Enter a destination address'); return; }
        if (!amount) { setLocalError('Enter an amount'); return; }
        if (walletType === 'spot' && (!symbol || !chainId)) {
            setLocalError('Spot needs a symbol and chainId');
            return;
        }
        try {
            const res = await withdrawViaBackend({
                accessToken,
                walletType,
                toAddress: toAddress.trim(),
                amount: amount.trim(),
                ...(walletType === 'spot'
                    ? { symbol: symbol.trim(), chainId: parseInt(chainId, 10) }
                    : {}),
            });
            setResult({ hash: res.hash, chainId: walletType === 'money' ? 9745 : parseInt(chainId, 10) });
        } catch (e: any) {
            setLocalError(e?.message || 'Withdraw failed');
        }
    };

    const shown = localError || error;

    return (
        <div className="min-h-screen bg-slate-50 p-6">
            <div className="max-w-md mx-auto">
                <button onClick={() => router.push('/dashboard')} className="text-sm text-slate-500 hover:text-slate-700 mb-4">← Back</button>

                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                    <h1 className="text-xl font-bold text-slate-900">Withdraw</h1>
                    <p className="text-sm text-slate-500 mt-1">Send to an external address · same-chain · 0.1% fee deducted</p>

                    <div className="grid grid-cols-2 gap-2 mt-6">
                        {(['money', 'spot'] as WalletType[]).map((w) => (
                            <button
                                key={w}
                                onClick={() => setWalletType(w)}
                                className={`rounded-lg py-3 text-sm font-medium border transition ${walletType === w
                                    ? 'bg-emerald-600 text-white border-emerald-600'
                                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'}`}
                            >
                                {w === 'money' ? 'Money (USDT0/Plasma)' : 'Spot (asset chain)'}
                            </button>
                        ))}
                    </div>

                    {walletType === 'spot' && (
                        <div className="grid grid-cols-2 gap-2 mt-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Symbol</label>
                                <input
                                    value={symbol}
                                    onChange={(e) => setSymbol(e.target.value)}
                                    placeholder="USDC"
                                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-black"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Chain ID</label>
                                <input
                                    value={chainId}
                                    onChange={(e) => setChainId(e.target.value)}
                                    placeholder="8453"
                                    inputMode="numeric"
                                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-black"
                                />
                            </div>
                        </div>
                    )}

                    <label className="block text-sm font-medium text-slate-700 mt-4 mb-1">Destination address</label>
                    <input
                        value={toAddress}
                        onChange={(e) => setToAddress(e.target.value)}
                        placeholder="0x…"
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-black font-mono text-sm"
                    />

                    <label className="block text-sm font-medium text-slate-700 mt-4 mb-1">
                        Amount ({walletType === 'money' ? 'USDT0' : symbol || 'token'})
                    </label>
                    <input
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        placeholder="10"
                        inputMode="decimal"
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-black"
                    />

                    <button
                        onClick={handleWithdraw}
                        disabled={isSending}
                        className="w-full mt-6 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-semibold rounded-lg py-3 transition"
                    >
                        {isSending ? 'Withdrawing…' : 'Withdraw'}
                    </button>

                    {shown && <div className="mt-4 bg-red-50 text-red-600 text-sm rounded-lg p-3 break-words">{shown}</div>}
                    {result && (
                        <div className="mt-4 bg-emerald-50 text-emerald-700 text-sm rounded-lg p-3">
                            <p className="font-semibold">Withdrawn ✓</p>
                            <a href={explorerTx(result.chainId, result.hash)} target="_blank" rel="noreferrer" className="font-mono text-xs underline break-all">{result.hash}</a>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
