'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import TransferModal from './components/TransferModal';
import OfframpModal from './components/OfframpModal';
import TransactionHistoryList from './components/TransactionHistoryList';
import { useDepositRegistration } from '@/hooks/useDepositRegistration';

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

interface WalletAddresses {
    spotEvm: string | null;
    spotSvm: string | null;
    moneyEvm: string | null;
    moneySvm: string | null;
}

type ActiveWallet = 'spot' | 'money';

export default function DashboardPage() {
    const router = useRouter();
    const [spotPortfolio, setSpotPortfolio] = useState<Portfolio | null>(null);
    const [moneyPortfolio, setMoneyPortfolio] = useState<Portfolio | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [username, setUsername] = useState<string | null>(null);
    const [accessToken, setAccessToken] = useState<string | null>(null);

    const [selectedToken, setSelectedToken] = useState<any>(null);
    const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
    const [selectedOfframpToken, setSelectedOfframpToken] = useState<any>(null);
    const [isOfframpModalOpen, setIsOfframpModalOpen] = useState(false);
    const [activeTab, setActiveTab] = useState<'tokens' | 'history' | 'unclaimed'>('tokens');
    const [selectedCurrency, setSelectedCurrency] = useState<string>('USD');
    const [activeWallet, setActiveWallet] = useState<ActiveWallet>('spot');
    const [depositRegistered, setDepositRegistered] = useState(false);
    const [depositMessage, setDepositMessage] = useState<string | null>(null);
    const { registerForDeposits, isRegistering, error: depositError } = useDepositRegistration();

    // Unclaimed tokens state
    const [unclaimedTokens, setUnclaimedTokens] = useState<any>(null);
    const [unclaimedLoading, setUnclaimedLoading] = useState(false);
    const [claimRecipient, setClaimRecipient] = useState<string | undefined>(undefined);
    const [claimAmount, setClaimAmount] = useState<string | undefined>(undefined);

    // Parse wallet addresses from localStorage
    const walletAddresses = useMemo<WalletAddresses>(() => {
        try {
            const walletsData = localStorage.getItem('wallets');
            if (walletsData) {
                const wallets = JSON.parse(walletsData);
                // Initialize deposit registration state from stored wallet data
                if (wallets?.money?.depositRegistered) {
                    setDepositRegistered(true);
                }
                return {
                    spotEvm: wallets?.spot?.evm?.address || null,
                    spotSvm: wallets?.spot?.svm?.address || null,
                    moneyEvm: wallets?.money?.evm?.address || null,
                    moneySvm: wallets?.money?.svm?.address || null,
                };
            }
        } catch (e) {
            console.error('Error parsing wallet data:', e);
        }
        return { spotEvm: null, spotSvm: null, moneyEvm: null, moneySvm: null };
    }, []);

    useEffect(() => {
        const token = localStorage.getItem('accessToken');
        const storedUsername = localStorage.getItem('username');
        if (storedUsername) setUsername(storedUsername);

        if (!token) {
            router.push('/');
            return;
        }
        setAccessToken(token);
        fetchAllBalances(token);
    }, []);

    const fetchAllBalances = async (token: string) => {
        setLoading(true);
        try {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

            const [spotRes, moneyRes] = await Promise.all([
                fetch(`${apiUrl}/transactions/balances?walletType=spot`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                }),
                fetch(`${apiUrl}/transactions/balances?walletType=money`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                }),
            ]);

            if (spotRes.status === 401 || moneyRes.status === 401) {
                localStorage.removeItem('accessToken');
                router.push('/');
                return;
            }

            if (spotRes.ok) setSpotPortfolio(await spotRes.json());
            if (moneyRes.ok) setMoneyPortfolio(await moneyRes.json());

            // Also fetch unclaimed tokens
            fetchUnclaimedTokens(token);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const fetchUnclaimedTokens = async (token: string) => {
        setUnclaimedLoading(true);
        try {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';
            const res = await fetch(`${apiUrl}/transactions/unclaimed`, {
                headers: { 'Authorization': `Bearer ${token}`, 'ngrok-skip-browser-warning': 'true' }
            });
            if (res.ok) setUnclaimedTokens(await res.json());
        } catch (err) {
            console.error('Failed to fetch unclaimed tokens:', err);
        } finally {
            setUnclaimedLoading(false);
        }
    };

    const handleLogout = () => {
        localStorage.removeItem('accessToken');
        localStorage.removeItem('username');
        localStorage.removeItem('wallets');
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
            'USD': '$', 'PKR': 'Rs', 'EUR': '€', 'GBP': '£',
            'INR': '₹', 'AED': 'AED', 'SAR': 'SAR', 'JPY': '¥', 'CNY': '¥'
        };
        return symbols[currency] || currency;
    };

    // Copy button component
    const CopyButton = ({ address, id }: { address: string; id: string }) => (
        <button
            onClick={() => {
                navigator.clipboard.writeText(address);
                const btn = document.getElementById(id);
                if (btn) {
                    const orig = btn.innerHTML;
                    btn.innerHTML = '<svg class="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>';
                    setTimeout(() => btn.innerHTML = orig, 2000);
                }
            }}
            id={id}
            className="p-2 hover:bg-slate-200 rounded transition text-slate-500 hover:text-slate-700"
            title="Copy address"
        >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
        </button>
    );

    // Build history chains from active wallet's addresses
    // NOTE: Must be before any early returns to satisfy Rules of Hooks
    const historyChains = useMemo(() => {
        const chains: any[] = [];
        if (activeWallet === 'spot') {
            if (walletAddresses.spotEvm) {
                chains.push({ chainId: 11155111, type: 'evm' as const, address: walletAddresses.spotEvm, assets: [] });
            }
            if (walletAddresses.spotSvm) {
                chains.push({ chainId: 0, type: 'svm' as const, address: walletAddresses.spotSvm, network: 'devnet', assets: [] });
            }
        } else {
            if (walletAddresses.moneyEvm) {
                chains.push({ chainId: 9745, type: 'evm' as const, address: walletAddresses.moneyEvm, assets: [] });
            }
        }
        return chains;
    }, [activeWallet, walletAddresses]);

    if (loading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;

    const walletConfig = {
        spot: {
            label: '💰 Spot Wallet',
            subtitle: 'All assets across EVM & SVM chains',
            gradient: 'from-purple-600 to-indigo-600',
            accentBorder: 'border-purple-500',
            tabActive: 'border-purple-600 text-purple-600',
        },
        money: {
            label: '🏦 Money Wallet',
            subtitle: 'Spendable stables — USDT0 on Plasma',
            gradient: 'from-emerald-600 to-teal-600',
            accentBorder: 'border-emerald-500',
            tabActive: 'border-emerald-600 text-emerald-600',
        }
    };

    const cfg = walletConfig[activeWallet];
    const currentPortfolio = activeWallet === 'spot' ? spotPortfolio : moneyPortfolio;

    return (
        <div className="min-h-screen bg-slate-50 p-6">
            <div className="max-w-4xl mx-auto">
                {/* Header */}
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h1 className="text-3xl font-bold text-slate-900">My Wallets</h1>
                        {username && <p className="text-slate-500">Welcome back, @{username}</p>}
                    </div>
                    <div className="flex items-center gap-4">
                        <button
                            onClick={() => {
                                setLoading(true);
                                const token = localStorage.getItem('accessToken');
                                if (token) fetchAllBalances(token);
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

                {/* Wallet Switcher */}
                <div className="flex gap-3 mb-6">
                    <button
                        onClick={() => { setActiveWallet('spot'); setActiveTab('tokens'); }}
                        className={`flex-1 px-5 py-4 rounded-xl font-semibold text-left transition-all border-2 ${
                            activeWallet === 'spot'
                                ? 'border-purple-500 bg-purple-50 text-purple-800 shadow-sm'
                                : 'border-slate-200 bg-white text-slate-600 hover:border-purple-300 hover:bg-purple-50/50'
                        }`}
                    >
                        <div className="flex items-center justify-between">
                            <div>
                                <span className="text-lg">💰</span>
                                <span className="ml-2 font-bold">Spot Wallet</span>
                                <p className="text-xs mt-1 opacity-70">All assets</p>
                            </div>
                            {spotPortfolio && (
                                <span className="text-lg font-bold">${spotPortfolio.totalUsd}</span>
                            )}
                        </div>
                    </button>
                    <button
                        onClick={() => { setActiveWallet('money'); setActiveTab('tokens'); }}
                        className={`flex-1 px-5 py-4 rounded-xl font-semibold text-left transition-all border-2 ${
                            activeWallet === 'money'
                                ? 'border-emerald-500 bg-emerald-50 text-emerald-800 shadow-sm'
                                : 'border-slate-200 bg-white text-slate-600 hover:border-emerald-300 hover:bg-emerald-50/50'
                        }`}
                    >
                        <div className="flex items-center justify-between">
                            <div>
                                <span className="text-lg">🏦</span>
                                <span className="ml-2 font-bold">Money Wallet</span>
                                <p className="text-xs mt-1 opacity-70">Spendable stables</p>
                            </div>
                            {moneyPortfolio && (
                                <span className="text-lg font-bold">${moneyPortfolio.totalUsd}</span>
                            )}
                        </div>
                    </button>
                </div>

                {error && <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-6">{error}</div>}

                {/* Active Wallet Content */}
                <div className="space-y-6">
                    {/* Balance Card */}
                    <div className={`bg-gradient-to-r ${cfg.gradient} rounded-2xl p-8 text-white shadow-lg`}>
                        <div className="flex justify-between items-start mb-2">
                            <div>
                                <p className="text-white/80 font-medium text-sm">{cfg.label}</p>
                                <p className="text-white/60 text-xs">{cfg.subtitle}</p>
                            </div>
                            {currentPortfolio?.convertedTotals && Object.keys(currentPortfolio.convertedTotals).length > 0 && (
                                <select
                                    value={selectedCurrency}
                                    onChange={(e) => setSelectedCurrency(e.target.value)}
                                    className="bg-white text-slate-900 rounded-lg px-3 py-1 text-sm font-medium border border-white/30 focus:outline-none focus:ring-2 focus:ring-white/40 cursor-pointer"
                                >
                                    <option value="USD">USD</option>
                                    {Object.keys(currentPortfolio.convertedTotals).map(currency => (
                                        <option key={currency} value={currency}>{currency}</option>
                                    ))}
                                </select>
                            )}
                        </div>
                        <h2 className="text-4xl font-bold mt-3">
                            {selectedCurrency === 'USD'
                                ? `$${currentPortfolio?.totalUsd || '0.00'}`
                                : `${getCurrencySymbol(selectedCurrency)} ${currentPortfolio?.convertedTotals?.[selectedCurrency] || '0.00'}`
                            }
                        </h2>
                    </div>

                    {/* Addresses */}
                    <div className={`bg-white rounded-xl shadow-sm border ${cfg.accentBorder} border-opacity-30 p-5`}>
                        <h3 className="text-sm font-bold text-slate-700 mb-3 uppercase tracking-wide">Addresses</h3>
                        <div className="space-y-2">
                            {activeWallet === 'spot' ? (
                                <>
                                    {walletAddresses.spotEvm && (
                                        <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                                            <div className="flex items-center gap-3">
                                                <span className="px-2 py-1 rounded text-xs font-bold uppercase bg-blue-100 text-blue-700">EVM</span>
                                                <code className="text-sm text-slate-600 font-mono">{walletAddresses.spotEvm.slice(0, 8)}...{walletAddresses.spotEvm.slice(-6)}</code>
                                            </div>
                                            <CopyButton address={walletAddresses.spotEvm} id="spot-evm-copy" />
                                        </div>
                                    )}
                                    {walletAddresses.spotSvm && (
                                        <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                                            <div className="flex items-center gap-3">
                                                <span className="px-2 py-1 rounded text-xs font-bold uppercase bg-purple-100 text-purple-700">SVM</span>
                                                <code className="text-sm text-slate-600 font-mono">{walletAddresses.spotSvm.slice(0, 8)}...{walletAddresses.spotSvm.slice(-6)}</code>
                                            </div>
                                            <CopyButton address={walletAddresses.spotSvm} id="spot-svm-copy" />
                                        </div>
                                    )}
                                </>
                            ) : (
                                <>
                                    {walletAddresses.moneyEvm && (
                                        <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                                            <div className="flex items-center gap-3">
                                                <span className="px-2 py-1 rounded text-xs font-bold uppercase bg-emerald-100 text-emerald-700">EVM</span>
                                                <code className="text-sm text-slate-600 font-mono">{walletAddresses.moneyEvm.slice(0, 8)}...{walletAddresses.moneyEvm.slice(-6)}</code>
                                            </div>
                                            <CopyButton address={walletAddresses.moneyEvm} id="money-evm-copy" />
                                        </div>
                                    )}
                                    <p className="text-xs text-slate-400 italic px-3">Plasma network · USDT0 target</p>

                                    {/* Auto-Deposits Registration */}
                                    <div className="mt-3 p-4 bg-emerald-50 rounded-lg border border-emerald-200">
                                        {depositRegistered ? (
                                            <div className="flex items-center gap-2">
                                                <span className="text-emerald-600 text-lg">✅</span>
                                                <div>
                                                    <p className="text-sm font-semibold text-emerald-800">Auto-Deposits Enabled</p>
                                                    <p className="text-xs text-emerald-600">Stablecoins sent to your address on any chain will auto-bridge to USDT0 on Plasma</p>
                                                </div>
                                            </div>
                                        ) : (
                                            <div>
                                                <div className="flex items-center justify-between">
                                                    <div>
                                                        <p className="text-sm font-semibold text-emerald-800">Enable Auto-Deposits</p>
                                                        <p className="text-xs text-emerald-600">Auto-bridge USDC/USDT from any chain to USDT0 on Plasma</p>
                                                    </div>
                                                    <button
                                                        onClick={async () => {
                                                            if (!accessToken) return;
                                                            setDepositMessage(null);
                                                            try {
                                                                const result = await registerForDeposits(accessToken);
                                                                setDepositRegistered(true);
                                                                setDepositMessage(result.message);
                                                                // Persist solanaDepositAddress as money SVM address in localStorage
                                                                if (result.solanaDepositAddress) {
                                                                    try {
                                                                        const walletsData = localStorage.getItem('wallets');
                                                                        if (walletsData) {
                                                                            const wallets = JSON.parse(walletsData);
                                                                            if (wallets.money) {
                                                                                wallets.money.svm = { address: result.solanaDepositAddress };
                                                                                wallets.money.depositRegistered = true;
                                                                                localStorage.setItem('wallets', JSON.stringify(wallets));
                                                                            }
                                                                        }
                                                                    } catch (e) { /* ignore localStorage errors */ }
                                                                }
                                                            } catch (err: any) {
                                                                setDepositMessage(err?.message || 'Registration failed');
                                                            }
                                                        }}
                                                        disabled={isRegistering || !accessToken}
                                                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                                    >
                                                        {isRegistering ? (
                                                            <>
                                                                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                                                                </svg>
                                                                Signing...
                                                            </>
                                                        ) : (
                                                            '🔐 Enable'
                                                        )}
                                                    </button>
                                                </div>
                                                {depositMessage && (
                                                    <p className={`text-xs mt-2 ${depositError ? 'text-red-600' : 'text-emerald-600'}`}>
                                                        {depositMessage}
                                                    </p>
                                                )}
                                                {depositError && (
                                                    <p className="text-xs mt-1 text-red-600">{depositError}</p>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    {/* Money Wallet SVM Address (Rhinestone Solana Deposit Address) */}
                                    {walletAddresses.moneySvm && (
                                        <div className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                                            <div className="flex items-center gap-3">
                                                <span className="px-2 py-1 rounded text-xs font-bold uppercase bg-purple-100 text-purple-700">SVM</span>
                                                <div>
                                                    <code className="text-sm text-slate-600 font-mono">{walletAddresses.moneySvm.slice(0, 8)}...{walletAddresses.moneySvm.slice(-6)}</code>
                                                    {depositRegistered && (
                                                        <p className="text-xs text-emerald-600 mt-0.5">Send SOL/USDC here → auto-bridges to USDT0 on Plasma</p>
                                                    )}
                                                </div>
                                            </div>
                                            <CopyButton address={walletAddresses.moneySvm} id="money-svm-copy" />
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </div>

                    {/* Assets / History Tabs */}
                    <div className="flex border-b border-slate-200 mb-0">
                        <button
                            onClick={() => setActiveTab('tokens')}
                            className={`px-6 py-3 text-sm font-medium border-b-2 transition ${activeTab === 'tokens'
                                ? cfg.tabActive
                                : 'border-transparent text-slate-500 hover:text-slate-700'
                            }`}
                        >
                            Assets
                        </button>
                        <button
                            onClick={() => setActiveTab('history')}
                            className={`px-6 py-3 text-sm font-medium border-b-2 transition ${activeTab === 'history'
                                ? cfg.tabActive
                                : 'border-transparent text-slate-500 hover:text-slate-700'
                            }`}
                        >
                            History
                        </button>
                        {activeWallet === 'money' && (
                            <button
                                onClick={() => setActiveTab('unclaimed')}
                                className={`px-6 py-3 text-sm font-medium border-b-2 transition ${activeTab === 'unclaimed'
                                    ? 'border-amber-500 text-amber-600'
                                    : 'border-transparent text-slate-500 hover:text-slate-700'
                                }`}
                            >
                                Unclaimed
                                {unclaimedTokens && unclaimedTokens.assets.length > 0 && (
                                    <span className="ml-1.5 bg-amber-100 text-amber-700 text-xs font-bold px-1.5 py-0.5 rounded-full">
                                        {unclaimedTokens.assets.length}
                                    </span>
                                )}
                            </button>
                        )}
                    </div>

                    {/* Tab Content */}
                    {activeTab === 'tokens' ? (
                        <div className="space-y-6">
                            {currentPortfolio && currentPortfolio.assets.length > 0 ? (
                                currentPortfolio.assets.map((asset, idx) => (
                                    <div key={idx} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                                        <div className="bg-slate-50 px-6 py-4 border-b border-slate-200">
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center gap-4">
                                                    <div className={`h-12 w-12 bg-gradient-to-br ${cfg.gradient} rounded-full flex items-center justify-center font-bold text-white text-lg`}>
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
                                            <div className="px-6 py-2">
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
                                                        <div className="flex items-center gap-2">
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
                                                            {['USDC', 'USDT'].includes(asset.symbol.toUpperCase()) && (
                                                                <button
                                                                    onClick={() => {
                                                                        setSelectedOfframpToken({
                                                                            symbol: asset.symbol,
                                                                            name: asset.name,
                                                                            balance: chain.balance,
                                                                            address: chain.address,
                                                                            chainId: chain.chainId,
                                                                            type: chain.type,
                                                                        });
                                                                        setIsOfframpModalOpen(true);
                                                                    }}
                                                                    disabled={parseFloat(chain.balance) === 0}
                                                                    className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
                                                                        parseFloat(chain.balance) === 0
                                                                            ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                                                                            : 'bg-amber-500 hover:bg-amber-600 text-white'
                                                                    }`}
                                                                >
                                                                    Off-Ramp
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-10 text-center text-slate-500 italic">
                                    No assets found in {activeWallet === 'spot' ? 'Spot' : 'Money'} Wallet
                                </div>
                            )}
                        </div>
                    ) : activeTab === 'unclaimed' ? (
                        /* Unclaimed Tokens Tab */
                        <div className="space-y-4">
                            {unclaimedLoading ? (
                                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-10 text-center text-slate-500">Loading unclaimed tokens...</div>
                            ) : unclaimedTokens && unclaimedTokens.assets.length > 0 ? (
                                <>
                                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700">
                                        These tokens were deposited to your Money Wallet but are not auto-bridged. Claim them to move to your Spot Wallet.
                                    </div>
                                    {unclaimedTokens.assets.map((asset: any, idx: number) => (
                                        <div key={idx} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                                            <div className="px-6 py-4 flex items-center justify-between">
                                                <div className="flex items-center gap-4">
                                                    <div className="h-10 w-10 bg-gradient-to-br from-amber-400 to-orange-500 rounded-full flex items-center justify-center font-bold text-white">
                                                        {asset.symbol[0]}
                                                    </div>
                                                    <div>
                                                        <h3 className="font-bold text-slate-900">{asset.name}</h3>
                                                        <p className="text-sm text-slate-500">{asset.symbol}</p>
                                                    </div>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-lg font-bold text-slate-900">{parseFloat(asset.totalBalance).toFixed(6)}</p>
                                                    <p className="text-xs text-slate-500">${asset.totalUsdValue} USD</p>
                                                </div>
                                            </div>
                                            <div className="divide-y divide-slate-100">
                                                {asset.chains.map((chain: any, i: number) => (
                                                    <div key={i} className="px-6 py-3 flex items-center justify-between bg-slate-50">
                                                        <div className="flex items-center gap-3">
                                                            <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${chain.type === 'evm' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                                                                {chain.type}
                                                            </span>
                                                            <span className="text-sm text-slate-700">{chain.network}</span>
                                                        </div>
                                                        <div className="flex items-center gap-3">
                                                            <span className="text-sm font-mono text-slate-700">{parseFloat(chain.balance).toFixed(6)}</span>
                                                            <button
                                                                onClick={() => {
                                                                    const spotAddr = chain.type === 'evm'
                                                                        ? asset.claimTo?.evmAddress
                                                                        : asset.claimTo?.svmAddress;
                                                                    setClaimRecipient(spotAddr || '');
                                                                    setClaimAmount(chain.balance);
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
                                                                }}
                                                                disabled={parseFloat(chain.balance) === 0}
                                                                className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition ${parseFloat(chain.balance) === 0
                                                                    ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                                                                    : 'bg-amber-500 hover:bg-amber-600 text-white'
                                                                }`}
                                                            >
                                                                Claim
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </>
                            ) : (
                                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-10 text-center text-slate-500 italic">
                                    No unclaimed tokens
                                </div>
                            )}
                        </div>
                    ) : (
                        accessToken && (
                            <TransactionHistoryList
                                key={activeWallet}
                                chains={historyChains}
                                accessToken={accessToken}
                            />
                        )
                    )}
                </div>
            </div>

            <TransferModal
                isOpen={isTransferModalOpen}
                onClose={() => { setIsTransferModalOpen(false); setClaimRecipient(undefined); setClaimAmount(undefined); }}
                token={selectedToken}
                accessToken={localStorage.getItem('accessToken') || ''}
                walletType={activeWallet}
                defaultRecipient={claimRecipient}
                defaultAmount={claimAmount}
            />

            <OfframpModal
                isOpen={isOfframpModalOpen}
                onClose={() => setIsOfframpModalOpen(false)}
                token={selectedOfframpToken}
                accessToken={localStorage.getItem('accessToken') || ''}
            />
        </div>
    );
}
