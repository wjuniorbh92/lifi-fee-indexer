import 'dotenv/config';
import 'reflect-metadata';
import { buildServer } from './api/server.js';
import { loadEnv } from './config/env.js';
import { runAllScanners } from './core/ScannerOrchestrator.js';
import { registerShutdownHandler } from './core/helpers/gracefulShutdown.js';
import { initScanners } from './core/initScanners.js';
import { createLogger } from './utils/logger.js';

const FATAL_EXIT_CODE = 1;

async function main(): Promise<void> {
	const env = loadEnv();
	const logger = createLogger(env.LOG_LEVEL);

	const scanners = await initScanners(env, logger);

	const app = await buildServer(logger);
	await app.listen({ port: env.PORT, host: env.HOST });
	logger.info({ port: env.PORT, host: env.HOST }, 'API server started');

	registerShutdownHandler(async () => {
		await app.close();
		logger.info('API server stopped');
	});

	await runAllScanners(scanners, env.POLL_INTERVAL_MS, logger);
}

main().catch((err) => {
	console.error('Fatal error:', err);
	process.exit(FATAL_EXIT_CODE);
});
