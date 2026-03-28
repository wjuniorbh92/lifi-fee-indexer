import type { Env } from './env.js';
import type { ChainConfig } from './types.js';

export function buildChainConfigs(env: Env): ChainConfig[] {
	const chains: ChainConfig[] = [
		{
			chainId: 'polygon',
			name: 'Polygon',
			rpcUrl: env.POLYGON_RPC_URL,
			contractAddress: env.FEE_COLLECTOR_ADDRESS,
			startBlock: env.EVM_START_BLOCK,
			batchSize: env.BATCH_SIZE,
			confirmations: 64,
			type: 'evm',
		},
	];

	if (env.STELLAR_INTEGRATOR_ADDRESS) {
		chains.push({
			chainId: 'stellar-testnet',
			name: 'Stellar Testnet',
			rpcUrl: env.STELLAR_HORIZON_URL,
			contractAddress: env.STELLAR_INTEGRATOR_ADDRESS,
			startBlock: 0,
			batchSize: env.BATCH_SIZE,
			confirmations: 0,
			type: 'stellar',
		});
	}

	return chains;
}
