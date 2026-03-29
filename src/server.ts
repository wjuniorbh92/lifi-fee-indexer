import 'reflect-metadata';
import 'dotenv/config';
import { buildServer } from './api/server.js';
import { loadEnv } from './config/env.js';
import { initShutdownHandler, registerShutdownHandler } from './core/helpers/gracefulShutdown.js';
import { buildScannerMap } from './core/scannerRegistry.js';
import { connectDatabase, disconnectDatabase } from './models/database.js';
import { createLogger } from './utils/logger.js';

const FATAL_EXIT_CODE = 1;

async function main(): Promise<void> {
	const env = loadEnv();
	const logger = createLogger(env.LOG_LEVEL);

	initShutdownHandler(logger);

	await connectDatabase(env.MONGODB_URI, logger);
	registerShutdownHandler(() => disconnectDatabase(logger));

	const scanners = buildScannerMap(env);
	const app = await buildServer(logger, scanners);
	registerShutdownHandler(async () => {
		await app.close();
		logger.info('API server stopped');
	});

	await app.listen({ port: env.PORT, host: env.HOST });
	logger.info({ port: env.PORT, host: env.HOST }, 'API server started');
}

main().catch((err) => {
	console.error('Fatal error:', err);
	process.exit(FATAL_EXIT_CODE);
});
