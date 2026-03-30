import type { Env } from './env.js';
import type { ChainConfig } from './types.js';

const POLYGON_CONFIRMATION_DEPTH = 64;
const STELLAR_CHAIN_ID = 'stellar-testnet';
const STELLAR_CHAIN_NAME = 'Stellar Testnet';
const STELLAR_START_BLOCK = 0;
const STELLAR_CONFIRMATIONS = 0;

export function buildChainConfigs(env: Env): ChainConfig[] {
  const chains: ChainConfig[] = [
    {
      chainId: 'polygon',
      name: 'Polygon',
      rpcUrl: env.POLYGON_RPC_URL,
      contractAddress: env.FEE_COLLECTOR_ADDRESS,
      startBlock: env.EVM_START_BLOCK,
      batchSize: env.BATCH_SIZE,
      confirmations: POLYGON_CONFIRMATION_DEPTH,
      type: 'evm',
    },
  ];

  const stellarAddress = env.STELLAR_INTEGRATOR_ADDRESS?.trim();
  if (stellarAddress) {
    chains.push({
      chainId: STELLAR_CHAIN_ID,
      name: STELLAR_CHAIN_NAME,
      rpcUrl: env.STELLAR_HORIZON_URL,
      contractAddress: stellarAddress,
      startBlock: STELLAR_START_BLOCK,
      batchSize: env.BATCH_SIZE,
      confirmations: STELLAR_CONFIRMATIONS,
      type: 'stellar',
    });
  }

  return chains;
}
