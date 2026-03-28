import 'reflect-metadata';
import { buildServer } from './api/server.js';
import { buildChainConfigs } from './config/chains.js';
import { loadEnv } from './config/env.js';
import { runAllScanners } from './core/ScannerOrchestrator.js';
import { SyncStateManager } from './core/SyncStateManager.js';
import { registerShutdownHandler } from './core/helpers/gracefulShutdown.js';
import { connectDatabase, disconnectDatabase } from './models/database.js';
import { EvmScanner } from './scanners/evm/EvmScanner.js';
import { StellarScanner } from './scanners/stellar/StellarScanner.js';
import type { ChainScanner } from './scanners/types.js';
import { createLogger } from './utils/logger.js';

async function main(): Promise<void> {
	const env = loadEnv();
	const logger = createLogger(env.LOG_LEVEL);
	const configs = buildChainConfigs(env);

	await connectDatabase(env.MONGODB_URI, logger);
	registerShutdownHandler(() => disconnectDatabase(logger));

	const app = await buildServer();
	await app.listen({ port: env.PORT, host: env.HOST });
	logger.info({ port: env.PORT, host: env.HOST }, 'API server started');

	registerShutdownHandler(async () => {
		await app.close();
		logger.info('API server stopped');
	});

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

	await runAllScanners(scanners, env.POLL_INTERVAL_MS, logger);
}

main().catch((err) => {
	console.error('Fatal error:', err);
	process.exit(1);
});
