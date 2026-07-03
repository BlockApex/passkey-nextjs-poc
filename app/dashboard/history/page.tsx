'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { signedFetch } from '@/lib/api/signedFetch';

interface TransactionItem {
    _id: string;
    walletType: 'spot' | 'money';
    hash: string;
    chainType: 'evm' | 'svm';
    chainId: number;
    direction: 'incoming' | 'outgoing';
    status:
    | 'initiated'
    | 'pending'
    | 'confirmed'
    | 'settled'
    | 'failed'
    | 'cancelled'
    | 'refunded';
    category: string;
    timestamp: string;
    from: string;
    to: string;
    asset: {
        symbol: string;
        amount: string;
        address: string;
        decimals: number;
    };
    counterpartyUsername?: string;
    note?: string;
    // Provided by the backend now: human decimal amount + chain-aware explorer link.
    amountDecimal?: string;
    explorerUrl?: string | null;
}

interface HistoryResponse {
    items: TransactionItem[];
    pagination: {
        page: number;
        limit: number;
        total: number;
        totalPages: number;
    };
}

const CATEGORIES = [
    { value: '', label: 'All' },
    { value: 'on-chain-deposit', label: 'On-chain Deposit' },
    { value: 'on-chain-transfer', label: 'On-chain Transfer' },
    { value: 'handle-deposit', label: 'Handle Deposit' },
    { value: 'handle-transfer', label: 'Handle Transfer' },
    { value: 'payment-request', label: 'Payment Request' },
    { value: 'move', label: 'Move' },
    { value: 'claim', label: 'Claim' },
];

const WALLET_TYPES = [
    { value: '', label: 'All Wallets' },
    { value: 'spot', label: 'Spot' },
    { value: 'money', label: 'Money' },
];

const CHAIN_TYPES = [
    { value: '', label: 'All Chains' },
    { value: 'evm', label: 'EVM' },
    { value: 'svm', label: 'SVM' },
];

const TYPES = [
    { value: '', label: 'All Types' },
    { value: 'received', label: 'Received' },
    { value: 'sent', label: 'Sent' },
    { value: 'withdraw', label: 'Withdraw' },
    { value: 'deposit', label: 'Deposit' },
];

function getCategoryBadge(category: string) {
    const map: Record<string, { bg: string; text: string; label: string }> = {
        'on-chain-deposit': { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Deposit' },
        'on-chain-transfer': { bg: 'bg-orange-100', text: 'text-orange-700', label: 'Transfer' },
        'handle-deposit': { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Handle In' },
        'handle-transfer': { bg: 'bg-purple-100', text: 'text-purple-700', label: 'Handle Out' },
        'payment-request': { bg: 'bg-pink-100', text: 'text-pink-700', label: 'Payment Req' },
        'move': { bg: 'bg-cyan-100', text: 'text-cyan-700', label: 'Move' },
        'claim': { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Claim' },
    };
    const style = map[category] || { bg: 'bg-slate-100', text: 'text-slate-600', label: category };
    return style;
}

function getExplorerUrl(chainType: string, chainId: number, hash: string) {
    if (chainType === 'svm') {
        return `https://explorer.solana.com/tx/${hash}?cluster=devnet`;
    }
    const explorers: Record<number, string> = {
        11155111: `https://sepolia.etherscan.io/tx/${hash}`,
        9745: `https://plasmascan.to/tx/${hash}`,
        9746: `https://testnet.plasmascan.to/tx/${hash}`,
        8453: `https://basescan.org/tx/${hash}`,
        42161: `https://arbiscan.io/tx/${hash}`,
    };
    return explorers[chainId] || `#`;
}

export default function HistoryPage() {
    const router = useRouter();
    const [data, setData] = useState<HistoryResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    // Filters
    const [walletType, setWalletType] = useState('');
    const [category, setCategory] = useState('');
    const [type, setType] = useState('');
    const [chainType, setChainType] = useState('');
    const [tokenSymbol, setTokenSymbol] = useState('');
    const [fromDate, setFromDate] = useState('');
    const [toDate, setToDate] = useState('');
    const [page, setPage] = useState(1);

    const fetchHistory = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const accessToken = localStorage.getItem('accessToken');
            if (!accessToken) {
                router.push('/');
                return;
            }

            const params = new URLSearchParams();
            if (walletType) params.set('walletType', walletType);
            if (category) params.set('category', category);
            if (type) params.set('type', type);
            if (chainType) params.set('chainType', chainType);
            if (tokenSymbol) params.set('tokenSymbol', tokenSymbol);
            if (fromDate) params.set('from', fromDate);
            if (toDate) params.set('to', toDate);
            params.set('page', page.toString());
            params.set('limit', '20');

            const res = await signedFetch(`/transactions/history?${params}`, {
                auth: true,
            });

            if (!res.ok) throw new Error(`Failed to fetch history: ${res.status}`);
            const json = await res.json();
            setData(json);
        } catch (err: any) {
            setError(err.message || 'Failed to load history');
        } finally {
            setLoading(false);
        }
    }, [walletType, category, type, chainType, tokenSymbol, fromDate, toDate, page, router]);

    useEffect(() => {
        fetchHistory();
    }, [fetchHistory]);

    // Reset page when filters change
    useEffect(() => {
        setPage(1);
    }, [walletType, category, type, chainType, tokenSymbol, fromDate, toDate]);

    return (
        <div className="min-h-screen bg-gradient-to-b from-slate-50 to-slate-100">
            <div className="max-w-4xl mx-auto px-6 py-8">
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
                        <h1 className="text-2xl font-bold text-slate-900">Transaction History</h1>
                        <p className="text-sm text-slate-500">All activity across wallets and chains</p>
                    </div>
                </div>

                {/* Filters */}
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-6 space-y-3">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        <select
                            value={type}
                            onChange={(e) => setType(e.target.value)}
                            className="px-3 py-2 rounded-lg border border-slate-200 text-black text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-400"
                        >
                            {TYPES.map((o) => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                        </select>
                        <select
                            value={walletType}
                            onChange={(e) => setWalletType(e.target.value)}
                            className="px-3 py-2 rounded-lg border border-slate-200 text-black  text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-400"
                        >
                            {WALLET_TYPES.map((o) => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                        </select>
                        <select
                            value={category}
                            onChange={(e) => setCategory(e.target.value)}
                            className="px-3 py-2 rounded-lg border border-slate-200 text-black  text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-400"
                        >
                            {CATEGORIES.map((o) => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                        </select>
                        <select
                            value={chainType}
                            onChange={(e) => setChainType(e.target.value)}
                            className="px-3 py-2 rounded-lg border border-slate-200 text-black  text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-400"
                        >
                            {CHAIN_TYPES.map((o) => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                        </select>
                        <input
                            type="text"
                            placeholder="Token (e.g. USDC)"
                            value={tokenSymbol}
                            onChange={(e) => setTokenSymbol(e.target.value)}
                            className="px-3 py-2 rounded-lg border border-slate-200 text-black  text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-400"
                        />
                    </div>
                    {/* Date range */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <label className="flex items-center gap-2 text-xs text-slate-500">
                            <span className="w-10">From</span>
                            <input
                                type="date"
                                value={fromDate}
                                onChange={(e) => setFromDate(e.target.value)}
                                className="flex-1 px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-400"
                            />
                        </label>
                        <label className="flex items-center gap-2 text-xs text-slate-500">
                            <span className="w-6">To</span>
                            <input
                                type="date"
                                value={toDate}
                                onChange={(e) => setToDate(e.target.value)}
                                className="flex-1 px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-purple-400"
                            />
                        </label>
                    </div>
                    {(fromDate || toDate || type || walletType || category || chainType || tokenSymbol) && (
                        <button
                            onClick={() => {
                                setType(''); setWalletType(''); setCategory('');
                                setChainType(''); setTokenSymbol(''); setFromDate(''); setToDate('');
                            }}
                            className="text-xs text-slate-500 hover:text-slate-700 underline"
                        >
                            Clear filters
                        </button>
                    )}
                </div>

                {/* Content */}
                {loading ? (
                    <div className="py-16 text-center text-slate-500">Loading history...</div>
                ) : error ? (
                    <div className="py-8 text-center text-red-500">{error}</div>
                ) : !data || data.items.length === 0 ? (
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
                        <svg className="w-12 h-12 mx-auto text-slate-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <p className="text-slate-500 font-medium">No transactions found</p>
                        <p className="text-sm text-slate-400 mt-1">Transactions will appear here after transfers</p>
                    </div>
                ) : (
                    <>
                        {/* Transaction List */}
                        <div className="space-y-3">
                            {data.items.map((tx) => {
                                const badge = getCategoryBadge(tx.category);
                                const isIncoming = tx.direction === 'incoming';
                                // Terminal "reversed/unsuccessful" states: don't render as a green credit.
                                const isBad = ['failed', 'refunded', 'cancelled'].includes(tx.status);

                                return (
                                    <div
                                        key={tx._id}
                                        className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 hover:shadow-md transition"
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                {/* Direction icon */}
                                                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isBad ? 'bg-slate-100' : isIncoming ? 'bg-emerald-100' : 'bg-orange-100'
                                                    }`}>
                                                    <svg
                                                        className={`w-5 h-5 ${isBad ? 'text-slate-400' : isIncoming ? 'text-emerald-600' : 'text-orange-600'}`}
                                                        fill="none"
                                                        stroke="currentColor"
                                                        viewBox="0 0 24 24"
                                                    >
                                                        <path
                                                            strokeLinecap="round"
                                                            strokeLinejoin="round"
                                                            strokeWidth={2}
                                                            d={isIncoming
                                                                ? 'M19 14l-7 7m0 0l-7-7m7 7V3'
                                                                : 'M5 10l7-7m0 0l7 7m-7-7v18'
                                                            }
                                                        />
                                                    </svg>
                                                </div>

                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-semibold text-slate-900">
                                                            {isIncoming ? 'Received' : 'Sent'}{' '}
                                                            {tx.asset.symbol}
                                                        </span>
                                                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${badge.bg} ${badge.text}`}>
                                                            {badge.label}
                                                        </span>
                                                        <span className={`text-xs px-1.5 py-0.5 rounded ${tx.walletType === 'money'
                                                            ? 'bg-emerald-50 text-emerald-600'
                                                            : 'bg-purple-50 text-purple-600'
                                                            }`}>
                                                            {tx.walletType}
                                                        </span>
                                                        {isBad && (
                                                            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-rose-50 text-rose-600 capitalize">
                                                                {tx.status}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-2 mt-1 text-xs text-slate-500">
                                                        {tx.counterpartyUsername ? (
                                                            <span>
                                                                {isIncoming ? 'from' : 'to'}{' '}
                                                                <span className="font-medium text-slate-700">@{tx.counterpartyUsername}</span>
                                                            </span>
                                                        ) : (
                                                            <span className="font-mono">
                                                                {isIncoming ? 'from' : 'to'}{' '}
                                                                {(isIncoming ? tx.from : tx.to).slice(0, 6)}...
                                                                {(isIncoming ? tx.from : tx.to).slice(-4)}
                                                            </span>
                                                        )}
                                                        <span className="text-slate-300">•</span>
                                                        <span>{tx.chainType.toUpperCase()}</span>
                                                        {tx.note && (
                                                            <>
                                                                <span className="text-slate-300">•</span>
                                                                <span className="italic">{tx.note}</span>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="text-right">
                                                <p className={`font-bold ${isBad ? 'text-slate-400 line-through' : isIncoming ? 'text-emerald-600' : 'text-slate-900'}`}>
                                                    {isBad ? '' : isIncoming ? '+' : '-'}{tx.amountDecimal ?? (Number(tx.asset.amount) / 10 ** (tx.asset.decimals || 0)).toString()} {tx.asset.symbol}
                                                </p>
                                                <p className="text-xs text-slate-400 mt-1">
                                                    {new Date(tx.timestamp).toLocaleString()}
                                                </p>
                                                <a
                                                    href={tx.explorerUrl ?? getExplorerUrl(tx.chainType, tx.chainId, tx.hash)}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                    className="text-xs text-blue-500 hover:text-blue-700 underline"
                                                >
                                                    View tx
                                                </a>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Pagination */}
                        {data.pagination.totalPages > 1 && (
                            <div className="flex items-center justify-center gap-3 mt-8">
                                <button
                                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                                    disabled={page <= 1}
                                    className="px-4 py-2 text-sm rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                                >
                                    Previous
                                </button>
                                <span className="text-sm text-slate-500">
                                    Page {data.pagination.page} of {data.pagination.totalPages}
                                </span>
                                <button
                                    onClick={() => setPage((p) => p + 1)}
                                    disabled={page >= data.pagination.totalPages}
                                    className="px-4 py-2 text-sm rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                                >
                                    Next
                                </button>
                            </div>
                        )}

                        <p className="text-center text-xs text-slate-400 mt-4">
                            {data.pagination.total} total transactions
                        </p>
                    </>
                )}
            </div>
        </div>
    );
}
