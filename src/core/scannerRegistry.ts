import { buildChainConfigs } from '../config/chains.js';
import type { Env } from '../config/env.js';
import { EvmScanner } from '../scanners/evm/EvmScanner.js';
import { StellarScanner } from '../scanners/stellar/StellarScanner.js';
import type { ChainScanner } from '../scanners/types.js';

/** Build a chainId → scanner map for on-demand event fetching. */
export function buildScannerMap(env: Env): Map<string, ChainScanner> {
	const configs = buildChainConfigs(env);
	const map = new Map<string, ChainScanner>();

	for (const config of configs) {
		const scanner = config.type === 'stellar' ? new StellarScanner(config) : new EvmScanner(config);
		map.set(config.chainId, scanner);
	}

	return map;
}
