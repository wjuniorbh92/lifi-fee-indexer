import type pino from 'pino';
import { buildChainConfigs } from '../config/chains.js';
import type { Env } from '../config/env.js';
import { connectDatabase, disconnectDatabase } from '../models/database.js';
import { EvmScanner } from '../scanners/evm/EvmScanner.js';
import { StellarScanner } from '../scanners/stellar/StellarScanner.js';
import type { ChainScanner } from '../scanners/types.js';
import { SyncStateManager } from './SyncStateManager.js';
import { registerShutdownHandler } from './helpers/gracefulShutdown.js';

/**
 * Shared bootstrap: connect to MongoDB, build scanners, restore Stellar cursors.
 * Used by both `index.ts` (combined) and `scanner.ts` (scanner-only) entry points.
 */
export async function initScanners(env: Env, logger: pino.Logger): Promise<ChainScanner[]> {
	const configs = buildChainConfigs(env);

	await connectDatabase(env.MONGODB_URI, logger);
	registerShutdownHandler(() => disconnectDatabase(logger));

	const scanners: ChainScanner[] = configs.map((config) => {
		if (config.type === 'stellar') {
			return new StellarScanner(config);
		}
		return new EvmScanner(config);
	});

	for (const scanner of scanners) {
		if (scanner instanceof StellarScanner) {
			const cursor = await SyncStateManager.loadCursor(scanner.config.chainId);
			if (cursor) scanner.setCursor(cursor);
		}
	}

	return scanners;
}
