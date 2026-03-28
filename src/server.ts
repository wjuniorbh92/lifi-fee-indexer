import 'reflect-metadata';
import { buildServer } from './api/server.js';
import { loadEnv } from './config/env.js';
import { registerShutdownHandler } from './core/helpers/gracefulShutdown.js';
import { connectDatabase, disconnectDatabase } from './models/database.js';
import { createLogger } from './utils/logger.js';

async function main(): Promise<void> {
	const env = loadEnv();
	const logger = createLogger(env.LOG_LEVEL);

	await connectDatabase(env.MONGODB_URI, logger);
	registerShutdownHandler(() => disconnectDatabase(logger));

	const app = await buildServer();

	await app.listen({ port: env.PORT, host: env.HOST });
	logger.info({ port: env.PORT, host: env.HOST }, 'API server started');

	registerShutdownHandler(async () => {
		await app.close();
		logger.info('API server stopped');
	});
}

main().catch((err) => {
	console.error('Fatal error:', err);
	process.exit(1);
});
