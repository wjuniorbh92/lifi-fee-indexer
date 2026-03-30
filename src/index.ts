import 'reflect-metadata';
import 'dotenv/config';
import { buildServer } from './api/server.js';
import { loadEnv } from './config/env.js';
import { runAllScanners } from './core/ScannerOrchestrator.js';
import {
  initShutdownHandler,
  registerShutdownHandler,
} from './core/helpers/gracefulShutdown.js';
import { initScanners } from './core/initScanners.js';
import { buildScannerMap } from './core/scannerRegistry.js';
import { createLogger } from './utils/logger.js';

const FATAL_EXIT_CODE = 1;
const FATAL_ERROR_PREFIX = 'Fatal error:';

async function main(): Promise<void> {
  const env = loadEnv();
  const logger = createLogger(env.LOG_LEVEL);

  initShutdownHandler(logger);

  const scanners = await initScanners(env, logger);
  const scannerMap = buildScannerMap(env);

  const app = await buildServer({
    logger,
    scanners: scannerMap,
    pollIntervalMs: env.POLL_INTERVAL_MS,
  });
  await app.listen({ port: env.PORT, host: env.HOST });
  logger.info({ port: env.PORT, host: env.HOST }, 'API server started');

  registerShutdownHandler(async () => {
    await app.close();
    logger.info('API server stopped');
  });

  await runAllScanners(scanners, env.POLL_INTERVAL_MS, logger);
}

main().catch((err) => {
  console.error(FATAL_ERROR_PREFIX, err);
  process.exit(FATAL_EXIT_CODE);
});
