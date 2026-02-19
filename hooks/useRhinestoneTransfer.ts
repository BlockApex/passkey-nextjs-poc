'use client';

import { useState, useCallback } from 'react';
import { RhinestoneSDK } from '@rhinestone/sdk';
import { toWebAuthnAccount } from 'viem/account-abstraction';
import {
    encodeFunctionData,
    erc20Abi,
    parseUnits,
    type Hex,
    type Chain,
} from 'viem';
import * as viemChains from 'viem/chains';
import { plasma, plasmaTestnet, PLASMA_USDT0_ADDRESS } from '@/lib/chains/plasma';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

/**
 * Get the Rhinestone SDK endpoint URL — uses our API proxy
 * to keep the API key server-side.
 */
function getRhinestoneEndpoint(): string {
    const baseUrl =
        typeof window !== 'undefined'
            ? window.location.origin
            : process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    return `${baseUrl}/api/orchestrator`;
}

/**
 * Resolve a viem Chain from a numeric chainId.
 * Includes custom Plasma chain definitions.
 */
function getChainById(chainId: number): Chain {
    // Check custom chains first
    if (chainId === plasma.id) return plasma;
    if (chainId === plasmaTestnet.id) return plasmaTestnet;

    const allChains = Object.values(viemChains) as Chain[];
    const found = allChains.find((c) => c.id === chainId);
    if (!found) {
        throw new Error(`Unsupported chain ID: ${chainId}`);
    }
    return found;
}

interface TransferResult {
    hash: string;
    intentId?: string;
}

/**
 * Hook for sending EVM transfers via Rhinestone SDK with passkey signing.
 *
 * Supports:
 * - Same-chain transfers (ERC-20 and native ETH)
 * - Cross-chain transfers via Intents API (bridge + execute on target chain)
 * - Gasless USDT0 transfers on Plasma
 *
 * Flow:
 * 1. Fetch wallet config (credentialId, pubX, pubY) from backend
 * 2. Build WebAuthn account with browser-native signing
 * 3. Create Rhinestone Nexus smart account
 * 4. Send transaction (triggers passkey biometric prompt)
 */
export function useRhinestoneTransfer() {
    const [isSending, setIsSending] = useState(false);
    const [error, setError] = useState<string | null>(null);

    /**
     * Build a Rhinestone account from the user's passkey credentials.
     */
    const buildRhinestoneAccount = useCallback(async (
        accessToken: string,
        walletType: 'spot' | 'money',
    ) => {
        // 1. Fetch wallet config from backend
        const configRes = await fetch(`${API_BASE}/wallet/config`, {
            headers: {
                'Authorization': `Bearer ${accessToken}`,
                'ngrok-skip-browser-warning': 'true',
            },
        });
        if (!configRes.ok) throw new Error('Failed to fetch wallet config');
        const config = await configRes.json();

        // 2. Build uncompressed P256 public key: 0x04 || x (32 bytes) || y (32 bytes)
        const xHex = config.pubX.replace('0x', '').padStart(64, '0');
        const yHex = config.pubY.replace('0x', '').padStart(64, '0');
        const uncompressedPubKey = ('0x04' + xHex + yHex) as Hex;

        // 3. Create WebAuthn account (uses browser's navigator.credentials.get for signing)
        const passkeyAccount = toWebAuthnAccount({
            credential: {
                id: config.credentialId,
                publicKey: uncompressedPubKey,
            },
            rpId: window.location.hostname,
        });

        // 4. Create Rhinestone SDK with proxy endpoint (API key stays server-side)
        const rhinestone = new RhinestoneSDK({
            apiKey: 'proxy',
            endpointUrl: getRhinestoneEndpoint(),
        });

        const accountConfig: any = {
            owners: {
                type: 'passkey',
                accounts: [passkeyAccount],
            },
        };

        // Use salt for money wallet (must match backend derivation)
        if (walletType === 'money') {
            accountConfig.account = {
                type: 'nexus',
                salt: '0x0000000000000000000000000000000000000000000000000000000000000001' as Hex,
            };
        }

        const rhinestoneAccount = await rhinestone.createAccount(accountConfig);
        return rhinestoneAccount;
    }, []);

    /**
     * Send a same-chain EVM transfer (native ETH or ERC-20).
     */
    const sendEvmTransfer = useCallback(async (params: {
        accessToken: string;
        chainId: number;
        to: string;           // Recipient address
        tokenAddress: string; // Token contract address or 'native'
        amount: string;       // Human-readable amount (e.g. "1.5")
        decimals: number;
        walletType: 'spot' | 'money';
    }): Promise<TransferResult> => {
        setIsSending(true);
        setError(null);

        try {
            const rhinestoneAccount = await buildRhinestoneAccount(
                params.accessToken,
                params.walletType,
            );

            const chain = getChainById(params.chainId);
            const amountWei = parseUnits(params.amount, params.decimals);

            // Check if this is a Plasma USDT0 transfer (gasless at protocol level)
            const isPlasmaUsdt0 =
                (params.chainId === plasma.id || params.chainId === plasmaTestnet.id) &&
                params.tokenAddress.toLowerCase() === PLASMA_USDT0_ADDRESS.toLowerCase();

            if (params.tokenAddress === 'native') {
                // Native ETH transfer
                const txResult = await rhinestoneAccount.sendTransaction({
                    chain,
                    calls: [{
                        to: params.to as `0x${string}`,
                        value: amountWei,
                        data: '0x' as Hex,
                    }],
                    sponsored: true,
                });

                const receipt = await rhinestoneAccount.waitForExecution(txResult);
                return { hash: (receipt as any)?.transactionHash || (txResult as any)?.id?.toString() || 'submitted' };
            } else {
                // ERC-20 transfer
                const data = encodeFunctionData({
                    abi: erc20Abi,
                    functionName: 'transfer',
                    args: [params.to as `0x${string}`, amountWei],
                });

                const txResult = await rhinestoneAccount.sendTransaction({
                    chain,
                    calls: [{
                        to: params.tokenAddress as `0x${string}`,
                        value: BigInt(0),
                        data,
                    }],
                    // USDT0 on Plasma is gasless at protocol level;
                    // other ERC-20s still need sponsorship
                    sponsored: !isPlasmaUsdt0,
                });

                const receipt = await rhinestoneAccount.waitForExecution(txResult);
                return { hash: (receipt as any)?.transactionHash || (txResult as any)?.id?.toString() || 'submitted' };
            }
        } catch (err: any) {
            const message = err.message || 'EVM transfer failed';
            setError(message);
            throw err;
        } finally {
            setIsSending(false);
        }
    }, [buildRhinestoneAccount]);

    /**
     * Send a cross-chain transfer using the Intents API.
     * Bridges tokens from source chain(s) and executes calls on the target chain.
     *
     * Example: Bridge USDC from Base → Plasma as USDT0
     */
    const sendCrossChainTransfer = useCallback(async (params: {
        accessToken: string;
        sourceChainIds: number[];   // Source chains to pull funds from
        targetChainId: number;      // Destination chain
        to: string;                 // Recipient address on target chain
        tokenAddress: string;       // Token to receive on target chain
        amount: string;             // Human-readable amount
        decimals: number;
        walletType: 'spot' | 'money';
    }): Promise<TransferResult> => {
        setIsSending(true);
        setError(null);

        try {
            const rhinestoneAccount = await buildRhinestoneAccount(
                params.accessToken,
                params.walletType,
            );

            const targetChain = getChainById(params.targetChainId);
            const sourceChains = params.sourceChainIds.map(getChainById);
            const amountWei = parseUnits(params.amount, params.decimals);

            // Build the transfer call on the target chain
            const data = encodeFunctionData({
                abi: erc20Abi,
                functionName: 'transfer',
                args: [params.to as `0x${string}`, amountWei],
            });

            const txResult = await rhinestoneAccount.sendTransaction({
                sourceChains,
                targetChain,
                calls: [{
                    to: params.tokenAddress as `0x${string}`,
                    value: BigInt(0),
                    data,
                }],
                tokenRequests: [{
                    address: params.tokenAddress as `0x${string}`,
                    amount: amountWei,
                }],
            });

            const receipt = await rhinestoneAccount.waitForExecution(txResult);
            return {
                hash: (receipt as any)?.fillTransactionHash ||
                    (receipt as any)?.transactionHash ||
                    (txResult as any)?.id?.toString() ||
                    'submitted',
                intentId: (txResult as any)?.id?.toString(),
            };
        } catch (err: any) {
            const message = err.message || 'Cross-chain transfer failed';
            setError(message);
            throw err;
        } finally {
            setIsSending(false);
        }
    }, [buildRhinestoneAccount]);

    /**
     * Get the portfolio (token balances across all chains) for the user's account.
     */
    const getPortfolio = useCallback(async (params: {
        accessToken: string;
        walletType: 'spot' | 'money';
    }) => {
        const rhinestoneAccount = await buildRhinestoneAccount(
            params.accessToken,
            params.walletType,
        );
        return rhinestoneAccount.getPortfolio();
    }, [buildRhinestoneAccount]);

    return {
        sendEvmTransfer,
        sendCrossChainTransfer,
        getPortfolio,
        isSending,
        error,
    };
}
