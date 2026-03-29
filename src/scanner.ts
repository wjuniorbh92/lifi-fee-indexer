import 'dotenv/config';
import 'reflect-metadata';
import { loadEnv } from './config/env.js';
import { runAllScanners } from './core/ScannerOrchestrator.js';
import { initScanners } from './core/initScanners.js';
import { createLogger } from './utils/logger.js';

const FATAL_EXIT_CODE = 1;

async function main(): Promise<void> {
	const env = loadEnv();
	const logger = createLogger(env.LOG_LEVEL);

	const scanners = await initScanners(env, logger);

	await runAllScanners(scanners, env.POLL_INTERVAL_MS, logger);
}

main().catch((err) => {
	console.error('Fatal error:', err);
	process.exit(FATAL_EXIT_CODE);
});
