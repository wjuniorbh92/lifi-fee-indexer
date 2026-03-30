import type { Env } from './env.js';
import type { ChainConfig } from './types.js';

const POLYGON_CONFIRMATION_DEPTH = 64;

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
      chainId: 'stellar-testnet',
      name: 'Stellar Testnet',
      rpcUrl: env.STELLAR_HORIZON_URL,
      contractAddress: stellarAddress,
      startBlock: 0,
      batchSize: env.BATCH_SIZE,
      confirmations: 0,
      type: 'stellar',
    });
  }

  return chains;
}
