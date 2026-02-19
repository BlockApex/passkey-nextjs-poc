/**
 * Plasma chain re-exports and USDT0 token addresses.
 *
 * Plasma and Plasma Testnet are available in viem/chains natively.
 * We re-export them here for convenience and add token addresses.
 */
export { plasma, plasmaTestnet } from 'viem/chains';

/**
 * USDT0 token address on Plasma Mainnet (chain 9745).
 */
export const PLASMA_USDT0_ADDRESS = '0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb';

/**
 * USDT0 token address on Plasma Testnet (chain 9746).
 * Different from mainnet — per Rhinestone deposit service demo.
 */
export const PLASMA_TESTNET_USDT0_ADDRESS = '0x502012b361aebce43b26ec812b74d9a51db4d412';
