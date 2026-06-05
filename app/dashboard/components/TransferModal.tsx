import { useState, useEffect } from 'react';
import { useLazorkitCustomSigner } from '@/hooks/useLazorkitCustomSigner';
import { useRhinestoneTransfer } from '@/hooks/useRhinestoneTransfer';
import { getConnection, buildUsdcTransferInstructions, createTransferSuccessMessage, validateRecipientAddress, validateTransferAmount, getUsdcBalance } from '@/lib/solana-utils';
import { PublicKey } from '@solana/web3.js';
import { signedFetch } from '@/lib/api/signedFetch';

/** Get the explorer URL for a given chain ID */
function getExplorerTxUrl(chainId: number | undefined, hash: string): string {
    switch (chainId) {
        case 9745:
            return `https://explorer.plasma.to/tx/${hash}`;
        case 9746:
            return `https://explorer-testnet.plasma.to/tx/${hash}`;
        case 11155111:
            return `https://sepolia.etherscan.io/tx/${hash}`;
        case 1:
            return `https://etherscan.io/tx/${hash}`;
        case 8453:
            return `https://basescan.org/tx/${hash}`;
        case 42161:
            return `https://arbiscan.io/tx/${hash}`;
        case 10:
            return `https://optimistic.etherscan.io/tx/${hash}`;
        case 137:
            return `https://polygonscan.com/tx/${hash}`;
        default:
            return `https://sepolia.etherscan.io/tx/${hash}`;
    }
}

interface TransferModalProps {
    isOpen: boolean;
    onClose: () => void;
    token: {
        symbol: string;
        name: string;
        balance: string;
        decimals: number;
        address: string;
        chainId?: number;
        type?: string;
    } | null;
    accessToken: string;
    walletType: 'spot' | 'money';
    defaultRecipient?: string;
    defaultAmount?: string;
}

/** Record a completed transfer in the backend for history & handle-user matching */
async function recordTransfer(params: {
    hash: string;
    chainType: 'evm' | 'svm';
    chainId: number;
    from: string;
    to: string;
    tokenSymbol: string;
    tokenAddress: string;
    tokenDecimals: number;
    amount: string;
    walletType: 'spot' | 'money';
    category?: string;
}) {
    try {
        await signedFetch('/transactions/record', {
            method: 'POST',
            auth: true,
            json: params,
        });
    } catch (e) {
        console.warn('[TransferModal] Failed to record transfer:', e);
    }
}

export default function TransferModal({ isOpen, onClose, token, accessToken, walletType, defaultRecipient, defaultAmount }: TransferModalProps) {
    const [recipient, setRecipient] = useState('');
    const [amount, setAmount] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [successHash, setSuccessHash] = useState('');
    const [status, setStatus] = useState('');

    // LazorKit Custom Signer Hook (SVM)
    const { signAndSendTransaction, isSigning } = useLazorkitCustomSigner();

    // Rhinestone Transfer Hook (EVM)
    const { sendEvmTransfer, isSending: isEvmSending } = useRhinestoneTransfer();

    // Helper to determine if token is SVM based
    const isSVM = token?.type === 'svm' || token?.chainId === 103 || token?.chainId === 900;
    const isPlasma = token?.chainId === 9745 || token?.chainId === 9746;

    useEffect(() => {
        if (!isOpen) {
            setRecipient('');
            setAmount('');
            setError('');
            setSuccessHash('');
            setStatus('');
        } else {
            // Prefill with defaults if provided (e.g., for claim flow)
            if (defaultRecipient) setRecipient(defaultRecipient);
            if (defaultAmount) setAmount(defaultAmount);
        }
    }, [isOpen, defaultRecipient, defaultAmount]);

    if (!isOpen || !token) return null;

    const handleTransfer = async () => {
        if (!recipient || !amount) {
            setError('Please fill in all fields');
            return;
        }

        setLoading(true);
        setError('');
        setStatus('Initializing Wallet...');

        // Get access token for backend auth
        const accessToken = localStorage.getItem('accessToken');
        if (!accessToken) {
            throw new Error('Not authenticated');
        }

        try {
            if (isSVM) {
                // --- SVM / LazorKit Custom Flow ---
                setStatus('Initializing SVM Wallet...');

                setStatus('Initializing Transfer...');
                const connection = getConnection();

                // Validate inputs
                const recipientValidation = validateRecipientAddress(recipient);
                if (!recipientValidation.valid) throw new Error(recipientValidation.error);

                const amountNum = parseFloat(amount);
                if (isNaN(amountNum) || amountNum <= 0) throw new Error("Invalid amount");

                // Fetch Wallet Config to get Credential ID and Public Key
                const configRes = await signedFetch('/wallet/config', {
                    auth: true,
                    headers: { 'ngrok-skip-browser-warning': 'true' },
                });

                if (!configRes.ok) throw new Error('Failed to fetch wallet config');
                const config = await configRes.json();

                // Fetch sender address from wallets in localStorage
                const walletsStr = localStorage.getItem('wallets');
                let senderAddress = '';

                if (walletsStr) {
                    try {
                        const walletsData = JSON.parse(walletsStr);
                        const activeWallet = walletsData[walletType];
                        if (activeWallet?.svm?.address) {
                            senderAddress = activeWallet.svm.address;
                        }
                    } catch (e) {
                        console.error('Failed to parse wallets from localStorage', e);
                    }
                }

                if (!senderAddress) {
                    throw new Error(`SVM address not found for ${walletType} wallet. Please try logging in again.`);
                }

                const senderPubkey = new PublicKey(senderAddress);

                // Debug Balance
                try {
                    const bal = await getUsdcBalance(connection, senderPubkey);
                    console.log(`[TransferModal] Sender: ${senderAddress}, USDC Balance: ${bal}`);
                    if (bal < amountNum) {
                        console.warn(`[TransferModal] WARNING: Insufficient Balance. Need ${amountNum}, Have ${bal}`);
                    }
                } catch (e) {
                    console.warn("[TransferModal] Failed to fetch balance for debug:", e);
                }

                setStatus('Building Instructions...');
                const instructions = await buildUsdcTransferInstructions(
                    connection,
                    senderPubkey,
                    recipientValidation.address!,
                    amountNum
                );

                setStatus('Please sign with Passkey...');

                // Use Custom Signer to sign and send transaction via Paymaster
                // Pass credential details for the assertion
                const signature = await signAndSendTransaction(instructions, {
                    credentialId: config.credentialId,
                    passkeyPublicKey: {
                        x: config.pubX,
                        y: config.pubY
                    },
                    // paymasterUrl not passed — hook defaults to local proxy to avoid CORS
                });

                setStatus('Transaction Submitted! Confirming...');
                console.log('SVM Tx Signature:', signature);

                await connection.confirmTransaction(signature, 'confirmed');

                setSuccessHash(signature);
                setStatus('Success!');

                // Record transfer for history
                recordTransfer({
                    hash: signature,
                    chainType: 'svm',
                    chainId: token.chainId || 103,
                    from: senderAddress,
                    to: recipientValidation.address!.toBase58(),
                    tokenSymbol: token.symbol,
                    tokenAddress: token.address,
                    tokenDecimals: token.decimals || 6,
                    amount,
                    walletType,
                });

                return; // Exit function after successful SVM transfer
            }

            // --- EVM / Rhinestone Flow ---
            setStatus(isPlasma ? 'Initializing Plasma Transfer...' : 'Initializing Rhinestone...');

            const result = await sendEvmTransfer({
                accessToken: accessToken || localStorage.getItem('accessToken') || '',
                chainId: token.chainId || 11155111, // Default to Sepolia
                to: recipient,
                tokenAddress: token.address,
                amount,
                decimals: token.decimals || 18,
                walletType,
            });

            setSuccessHash(result.hash);
            setStatus('Success!');

            // Record transfer for history
            const wallets = JSON.parse(localStorage.getItem('wallets') || '{}');
            const senderAddr = walletType === 'spot'
                ? wallets.spot?.evm?.address
                : wallets.money?.evm?.address;
            recordTransfer({
                hash: result.hash,
                chainType: 'evm',
                chainId: token.chainId || 11155111,
                from: senderAddr || '',
                to: recipient,
                tokenSymbol: token.symbol,
                tokenAddress: token.address,
                tokenDecimals: token.decimals || 18,
                amount,
                walletType,
            });

        } catch (err: any) {
            console.error('Transfer Error:', err);
            setError(err.message || 'Transfer failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-md p-6 shadow-2xl">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-bold text-white">Transfer {token.symbol}</h3>
                    <button onClick={onClose} className="text-gray-400 hover:text-white">✕</button>
                </div>

                {!successHash ? (
                    <div className="space-y-4">
                        <div className="bg-white/5 rounded-lg p-3">
                            <p className="text-sm text-gray-400">Available Balance</p>
                            <p className="text-xl font-mono text-white">{token.balance} {token.symbol}</p>
                        </div>

                        <div>
                            <label className="block text-sm text-gray-400 mb-1">Recipient Address</label>
                            <input
                                type="text"
                                value={recipient}
                                onChange={(e) => setRecipient(e.target.value)}
                                placeholder="0x..."
                                className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-purple-500 font-mono text-sm"
                            />
                        </div>

                        <div>
                            <label className="block text-sm text-gray-400 mb-1">Amount</label>
                            <input
                                type="number"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                placeholder="0.00"
                                className="w-full bg-black/20 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-purple-500 font-mono"
                            />
                        </div>

                        {error && (
                            <div className="bg-red-500/10 text-red-200 text-sm p-3 rounded-lg border border-red-500/20">
                                {error}
                            </div>
                        )}

                        {status && (
                            <div className="bg-blue-500/10 text-blue-200 text-sm p-3 rounded-lg border border-blue-500/20 animate-pulse">
                                {status}
                            </div>
                        )}

                        <button
                            onClick={handleTransfer}
                            disabled={loading || (isSigning && isSVM) || isEvmSending}
                            className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white font-semibold py-3 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed mt-2"
                        >
                            {loading || (isSigning && isSVM) || isEvmSending ? 'Processing...' : 'Send Now'}
                        </button>
                    </div>
                ) : (
                    <div className="text-center py-6">
                        <div className="w-16 h-16 bg-green-500/20 text-green-400 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl">
                            ✓
                        </div>
                        <h4 className="text-xl font-bold text-white mb-2">Transfer Successful!</h4>
                        <p className="text-gray-400 text-sm mb-6 max-w-xs mx-auto break-all">
                            {isSVM ? (
                                <>
                                    Tx Signature: <br />
                                    <a
                                        href={`https://explorer.solana.com/tx/${successHash}?cluster=devnet`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-purple-400 hover:text-purple-300 hover:underline"
                                    >
                                        {successHash}
                                    </a>
                                </>
                            ) : (
                                <>
                                    Tx Hash: <br />
                                    <a
                                        href={getExplorerTxUrl(token?.chainId, successHash)}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-purple-400 hover:text-purple-300 hover:underline"
                                    >
                                        {successHash}
                                    </a>
                                </>
                            )}
                        </p>
                        <button
                            onClick={onClose}
                            className="w-full bg-white/10 hover:bg-white/20 text-white font-semibold py-3 rounded-lg transition-all"
                        >
                            Close
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

