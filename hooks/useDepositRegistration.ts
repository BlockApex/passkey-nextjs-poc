'use client';

import { useState, useCallback } from 'react';
import { RhinestoneSDK, type Session } from '@rhinestone/sdk';
import { toViewOnlyAccount } from '@rhinestone/sdk/utils';
import { toWebAuthnAccount } from 'viem/account-abstraction';
import type { Hex, Chain, Address } from 'viem';
import * as viemChains from 'viem/chains';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

/** Rhinestone's fixed deposit service session signer (AWS KMS) */
const RHINESTONE_SIGNER_ADDRESS = '0x177bfcdd15bc01e99013dcc5d2b09cd87a18ce9c' as Address;

/** Plasma testnet USDT0 address */
const PLASMA_TESTNET_USDT0 = '0x502012b361aebce43b26ec812b74d9a51db4d412' as Address;
/** Plasma mainnet USDT0 address */
const PLASMA_MAINNET_USDT0 = '0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb' as Address;

/** Money wallet salt — must match backend derivation */
const MONEY_WALLET_SALT = '0x0000000000000000000000000000000000000000000000000000000000000001' as Hex;

/** Get the Rhinestone SDK endpoint URL — uses our API proxy */
function getRhinestoneEndpoint(): string {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return `${origin}/api/orchestrator`;
}

/**
 * Hook for registering a Money Wallet with Rhinestone's deposit service.
 *
 * Flow:
 * 1. Fetch wallet config (credentialId, pubX, pubY) from backend
 * 2. Build WebAuthn account + Rhinestone account with sessions enabled
 * 3. Get session details for all source chains + target chain
 * 4. Sign session grant with passkey (biometric prompt)
 * 5. Send signed session + initData to backend
 * 6. Backend forwards to Rhinestone deposit processor
 *
 * After registration, any stablecoins sent to the user's Nexus address
 * on any supported chain will auto-bridge to USDT0 on Plasma.
 * Registration also returns a Solana deposit address for 1-click Solana deposits.
 */
export function useDepositRegistration() {
    const [isRegistering, setIsRegistering] = useState(false);
    const [error, setError] = useState<string | null>(null);

    /**
     * Register the user's Money Wallet for auto-deposits.
     * Triggers a passkey biometric prompt (one-time).
     * Network (testnet/mainnet) is controlled by NEXT_PUBLIC_USE_TESTNET env var.
     *
     * @param accessToken - JWT access token
     * @returns Object with message, address, evmDepositAddress, and solanaDepositAddress
     */
    const registerForDeposits = useCallback(async (
        accessToken: string,
    ): Promise<{ message: string; address: string; evmDepositAddress?: string; solanaDepositAddress?: string }> => {
        const useTestnet = process.env.NEXT_PUBLIC_USE_TESTNET !== 'false';
        setIsRegistering(true);
        setError(null);

        try {
            // 1. Fetch wallet config from backend
            const configRes = await fetch(`${API_BASE}/wallet/config`, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'ngrok-skip-browser-warning': 'true',
                },
            });
            if (!configRes.ok) throw new Error('Failed to fetch wallet config');
            const config = await configRes.json();

            // 2. Build uncompressed P256 public key
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

            // 4. Create Rhinestone SDK with proxy endpoint
            const rhinestone = new RhinestoneSDK({
                apiKey: 'proxy',
                endpointUrl: getRhinestoneEndpoint(),
            });

            // 5. Create account with sessions enabled (Money Wallet uses salt)
            const rhinestoneAccount = await rhinestone.createAccount({
                account: {
                    type: 'nexus',
                    salt: MONEY_WALLET_SALT,
                },
                owners: {
                    type: 'passkey',
                    accounts: [passkeyAccount],
                },
                experimental_sessions: {
                    enabled: true,
                },
            });

            const address = rhinestoneAccount.getAddress();
            const { factory, factoryData } = rhinestoneAccount.getInitData();

            console.log(`[deposit-reg] Account address: ${address}`);
            console.log(`[deposit-reg] Factory: ${factory}`);

            // 6. Build session signer (Rhinestone's KMS address)
            const sessionSignerAccount = toViewOnlyAccount(RHINESTONE_SIGNER_ADDRESS);

            // 7. Determine chains
            const targetChain: Chain = useTestnet ? viemChains.plasmaTestnet : viemChains.plasma;
            const targetToken = useTestnet ? PLASMA_TESTNET_USDT0 : PLASMA_MAINNET_USDT0;

            // Source chains — chains where users might receive stablecoins
            const sourceChains: Chain[] = useTestnet
                ? [viemChains.sepolia, viemChains.baseSepolia, viemChains.optimismSepolia, viemChains.arbitrumSepolia]
                : [viemChains.mainnet, viemChains.base, viemChains.optimism, viemChains.arbitrum];

            // All unique chains = source + target
            const allChains = [...new Set([...sourceChains, targetChain])];

            console.log(`[deposit-reg] Preparing sessions for ${allChains.length} chains: ${allChains.map(c => c.name).join(', ')}`);

            // 8. Build sessions for each chain
            const sessions: Session[] = allChains.map((chain) => ({
                owners: {
                    type: 'ecdsa' as const,
                    accounts: [sessionSignerAccount],
                },
                chain,
            }));

            // 9. Get session digests from Rhinestone SDK
            const sessionDetails = await rhinestoneAccount.experimental_getSessionDetails(sessions);

            console.log(`[deposit-reg] Got session details for ${sessionDetails.hashesAndChainIds.length} chains`);

            // 10. Sign the session grant with the user's passkey (biometric prompt!)
            const enableSignature = await rhinestoneAccount.experimental_signEnableSession(sessionDetails);

            console.log(`[deposit-reg] Session signed successfully`);

            // 11. Send to backend for registration with deposit processor
            const registerRes = await fetch(`${API_BASE}/deposit/register`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${accessToken}`,
                    'ngrok-skip-browser-warning': 'true',
                },
                body: JSON.stringify({
                    address,
                    factory,
                    factoryData,
                    sessionDetails: {
                        hashesAndChainIds: sessionDetails.hashesAndChainIds.map(h => ({
                            chainId: h.chainId.toString(),
                            sessionDigest: h.sessionDigest,
                        })),
                        signature: enableSignature,
                    },
                    targetChainId: targetChain.id,
                    targetToken,
                }, (_, v) => typeof v === 'bigint' ? v.toString() : v),
            });

            if (!registerRes.ok) {
                const errData = await registerRes.text();
                throw new Error(`Registration failed: ${registerRes.status} ${errData}`);
            }

            const result = await registerRes.json();
            console.log(`[deposit-reg] Registration complete:`, result);
            if (result.solanaDepositAddress) {
                console.log(`[deposit-reg] Solana deposit address: ${result.solanaDepositAddress}`);
            }
            if (result.evmDepositAddress) {
                console.log(`[deposit-reg] EVM deposit address: ${result.evmDepositAddress}`);
            }

            return result;
        } catch (err: any) {
            const message = err?.message || 'Deposit registration failed';
            console.error('[deposit-reg] Error:', message);
            setError(message);
            throw err;
        } finally {
            setIsRegistering(false);
        }
    }, []);

    return {
        registerForDeposits,
        isRegistering,
        error,
    };
}
