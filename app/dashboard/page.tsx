'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import TransferModal from './components/TransferModal';
import TransactionHistoryList from './components/TransactionHistoryList';

interface ChainBreakdown {
    chainId: number;
    type: 'evm' | 'svm';
    network: string;
    address: string;
    balance: string;
    usdValue: number;
}

interface Asset {
    symbol: string;
    name: string;
    totalBalance: string;
    totalUsdValue: string;
    price: string;
    decimals: number;
    chains: ChainBreakdown[];
}

interface Portfolio {
    totalUsd: string;
    convertedTotals: Record<string, string>;
    assets: Asset[];
}

export default function DashboardPage() {
    const router = useRouter();
    const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [username, setUsername] = useState<string | null>(null);
    const [accessToken, setAccessToken] = useState<string | null>(null);

    const [selectedToken, setSelectedToken] = useState<any>(null);
    const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<'tokens' | 'history'>('tokens');
    const [selectedCurrency, setSelectedCurrency] = useState<string>('USD');

    useEffect(() => {
        const token = localStorage.getItem('accessToken');
        const storedUsername = localStorage.getItem('username');
        if (storedUsername) setUsername(storedUsername);

        if (!token) {
            router.push('/');
            return;
        }
        setAccessToken(token);

        fetchBalances(token);
    }, []);

    const fetchBalances = async (token: string) => {
        try {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';
            const res = await fetch(`${apiUrl}/transactions/balances`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (res.status === 401) {
                localStorage.removeItem('accessToken');
                router.push('/');
                return;
            }

            if (!res.ok) throw new Error('Failed to fetch balances');
            const data = await res.json();
            setPortfolio(data);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleLogout = () => {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('username');
        router.push('/');
    };

    const openTransferModal = (asset: Asset, chain: ChainBreakdown) => {
        setSelectedToken({ 
            symbol: asset.symbol,
            name: asset.name,
            balance: chain.balance,
            decimals: asset.decimals,
            address: chain.address,
            chainId: chain.chainId, 
            type: chain.type 
        });
        setIsTransferModalOpen(true);
    };

    const getCurrencySymbol = (currency: string) => {
        const symbols: Record<string, string> = {
            'USD': '$',
            'PKR': 'Rs',
            'EUR': '€',
            'GBP': '£',
            'INR': '₹',
            'AED': 'AED',
            'SAR': 'SAR',
            'JPY': '¥',
            'CNY': '¥'
        };
        return symbols[currency] || currency;
    };

    if (loading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;

    return (
        <div className="min-h-screen bg-slate-50 p-6">
            <div className="max-w-4xl mx-auto">
                <div className="flex justify-between items-center mb-8">
                    <div>
                        <h1 className="text-3xl font-bold text-slate-900">My Wallets</h1>
                        {username && <p className="text-slate-500">Welcome back, @{username}</p>}
                    </div>
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => {
                                setLoading(true);
                                const token = localStorage.getItem('accessToken');
                                if (token) fetchBalances(token);
                            }}
                            disabled={loading}
                            className="text-emerald-600 hover:text-emerald-700 font-medium flex items-center gap-2 disabled:opacity-50"
                        >
                            <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                            {loading ? 'Refreshing...' : 'Refresh'}
                        </button>
                        <button onClick={() => router.push('/')} className="text-slate-600 hover:text-slate-900 font-medium">
                            Back to Home
                        </button>
                        <button onClick={handleLogout} className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg transition font-medium">
                            Logout
                        </button>
                    </div>
                </div>

                {error && <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-6">{error}</div>}

                {portfolio ? (
                    <div className="space-y-6">
                        {/* Total Balance Card */}
                        <div className="bg-gradient-to-r from-emerald-600 to-teal-600 rounded-2xl p-8 text-white shadow-lg">
                            <div className="flex justify-between items-start mb-4">
                                <p className="text-emerald-100 font-medium">Total Balance</p>
                                {portfolio.convertedTotals && Object.keys(portfolio.convertedTotals).length > 0 && (
                                    <select 
                                        value={selectedCurrency}
                                        onChange={(e) => setSelectedCurrency(e.target.value)}
                                        className="bg-white text-slate-900 rounded-lg px-3 py-1 text-sm font-medium border border-white/30 focus:outline-none focus:ring-2 focus:ring-emerald-400 cursor-pointer"
                                    >
                                        <option value="USD" className="text-slate-900">USD</option>
                                        {Object.keys(portfolio.convertedTotals).map(currency => (
                                            <option key={currency} value={currency} className="text-slate-900">{currency}</option>
                                        ))}
                                    </select>
                                )}
                            </div>
                            <h2 className="text-4xl font-bold">
                                {selectedCurrency === 'USD' 
                                    ? `$${portfolio.totalUsd}` 
                                    : `${getCurrencySymbol(selectedCurrency)} ${portfolio.convertedTotals[selectedCurrency]}`
                                }
                            </h2>
                            {selectedCurrency !== 'USD' && (
                                <p className="text-emerald-100 text-sm mt-2">${portfolio.totalUsd} USD</p>
                            )}
                        </div>

                        {/* Wallet Addresses */}
                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                            <h3 className="text-lg font-bold text-slate-900 mb-4">Your Wallet Addresses</h3>
                            <div className="space-y-3">
                                {/* EVM Wallet */}
                                {(() => {
                                    try {
                                        const walletData = localStorage.getItem('wallet');
                                        if (walletData) {
                                            const wallet = JSON.parse(walletData);
                                            const evmAddress = wallet?.evm?.address;
                                            if (evmAddress) {
                                                return (
                                                    <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                                                        <div className="flex items-center gap-3">
                                                            <span className="px-2 py-1 rounded text-xs font-bold uppercase bg-blue-100 text-blue-700">
                                                                EVM
                                                            </span>
                                                            <code className="text-sm text-slate-600 font-mono">
                                                                {evmAddress.slice(0, 8)}...{evmAddress.slice(-6)}
                                                            </code>
                                                        </div>
                                                        <button
                                                            onClick={() => {
                                                                navigator.clipboard.writeText(evmAddress);
                                                                const btn = document.getElementById('evm-copy-btn');
                                                                if (btn) {
                                                                    const originalHTML = btn.innerHTML;
                                                                    btn.innerHTML = '<svg class="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>';
                                                                    setTimeout(() => btn.innerHTML = originalHTML, 2000);
                                                                }
                                                            }}
                                                            id="evm-copy-btn"
                                                            className="p-2 hover:bg-slate-200 rounded transition text-slate-500 hover:text-slate-700"
                                                            title="Copy EVM Address"
                                                        >
                                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                                                        </button>
                                                    </div>
                                                );
                                            }
                                        }
                                    } catch (e) {
                                        console.error('Error parsing wallet data:', e);
                                    }
                                    return null;
                                })()}
                                
                                {/* SVM Wallet */}
                                {(() => {
                                    try {
                                        const walletData = localStorage.getItem('wallet');
                                        if (walletData) {
                                            const wallet = JSON.parse(walletData);
                                            const svmAddress = wallet?.svm?.address;
                                            if (svmAddress) {
                                                return (
                                                    <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                                                        <div className="flex items-center gap-3">
                                                            <span className="px-2 py-1 rounded text-xs font-bold uppercase bg-purple-100 text-purple-700">
                                                                SVM
                                                            </span>
                                                            <code className="text-sm text-slate-600 font-mono">
                                                                {svmAddress.slice(0, 8)}...{svmAddress.slice(-6)}
                                                            </code>
                                                        </div>
                                                        <button
                                                            onClick={() => {
                                                                navigator.clipboard.writeText(svmAddress);
                                                                const btn = document.getElementById('svm-copy-btn');
                                                                if (btn) {
                                                                    const originalHTML = btn.innerHTML;
                                                                    btn.innerHTML = '<svg class="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>';
                                                                    setTimeout(() => btn.innerHTML = originalHTML, 2000);
                                                                }
                                                            }}
                                                            id="svm-copy-btn"
                                                            className="p-2 hover:bg-slate-200 rounded transition text-slate-500 hover:text-slate-700"
                                                            title="Copy SVM Address"
                                                        >
                                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                                                        </button>
                                                    </div>
                                                );
                                            }
                                        }
                                    } catch (e) {
                                        console.error('Error parsing wallet data:', e);
                                    }
                                    return null;
                                })()}
                            </div>
                        </div>

                        {/* Tabs */}
                        <div className="flex border-b border-slate-200 mb-6">
                            <button
                                onClick={() => setActiveTab('tokens')}
                                className={`px-6 py-3 text-sm font-medium border-b-2 transition ${activeTab === 'tokens'
                                    ? 'border-emerald-600 text-emerald-600'
                                    : 'border-transparent text-slate-500 hover:text-slate-700'
                                    }`}
                            >
                                Assets
                            </button>
                            <button
                                onClick={() => setActiveTab('history')}
                                className={`px-6 py-3 text-sm font-medium border-b-2 transition ${activeTab === 'history'
                                    ? 'border-emerald-600 text-emerald-600'
                                    : 'border-transparent text-slate-500 hover:text-slate-700'
                                    }`}
                            >
                                History
                            </button>
                        </div>

                        {/* Content */}
                        {activeTab === 'tokens' ? (
                            <div className="space-y-6">
                                {/* Assets */}
                                {portfolio.assets.map((asset, idx) => (
                                    <div key={idx} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                                        <div className="bg-slate-50 px-6 py-4 border-b border-slate-200">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-4">
                                                    <div className="h-12 w-12 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-full flex items-center justify-center font-bold text-white text-lg">
                                                        {asset.symbol[0]}
                                                    </div>
                                                    <div>
                                                        <h3 className="font-bold text-slate-900 text-lg">{asset.name}</h3>
                                                        <p className="text-sm text-slate-500">{asset.symbol}</p>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-2xl font-bold text-slate-900">{parseFloat(asset.totalBalance).toFixed(6)}</p>
                                                    <p className="text-sm text-slate-500">${asset.totalUsdValue} USD</p>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Chain Breakdown */}
                                        <div className="divide-y divide-slate-100">
                                            <div className="px-6 py-2 bg-slate-25">
                                                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Chain Breakdown</p>
                                            </div>
                                            {asset.chains.map((chain, i) => (
                                                <div key={i} className="px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition">
                                                    <div className="flex items-center gap-4">
                                                        <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${chain.type === 'evm' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                                                            {chain.type}
                                                        </span>
                                                        <div>
                                                            <p className="font-semibold text-slate-900">{chain.network}</p>
                                                            <p className="text-xs text-slate-500 font-mono">
                                                                {chain.address === 'native' ? 'Native Token' : `${chain.address.slice(0, 6)}...${chain.address.slice(-4)}`}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-6">
                                                        <div className="text-right">
                                                            <p className="font-bold text-slate-900">{parseFloat(chain.balance).toFixed(6)}</p>
                                                            <p className="text-xs text-slate-500">${chain.usdValue.toFixed(2)}</p>
                                                        </div>
                                                        <button
                                                            onClick={() => openTransferModal(asset, chain)}
                                                            disabled={parseFloat(chain.balance) === 0}
                                                            className={`px-4 py-2 text-white rounded-lg text-sm font-semibold transition ${
                                                                parseFloat(chain.balance) === 0 
                                                                    ? 'bg-slate-300 cursor-not-allowed'
                                                                    : chain.type === 'evm'
                                                                        ? 'bg-slate-900 hover:bg-slate-800'
                                                                        : 'bg-purple-600 hover:bg-purple-700'
                                                            }`}
                                                        >
                                                            Transfer
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                                {portfolio.assets.length === 0 && (
                                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-10 text-center text-slate-500 italic">
                                        No assets found
                                    </div>
                                )}
                            </div>
                        ) : (
                            accessToken && <TransactionHistoryList chains={[]} accessToken={accessToken} />
                        )}
                    </div>
                ) : (
                    <div className="text-center p-10">No portfolio data found.</div>
                )}
            </div>

            <TransferModal
                isOpen={isTransferModalOpen}
                onClose={() => setIsTransferModalOpen(false)}
                token={selectedToken}
                accessToken={localStorage.getItem('accessToken') || ''}
            />
        </div>
    );
}
