import type pino from 'pino';
import type { ChainConfig } from '../config/types.js';
import { isRetryableRpcError } from '../errors/RpcError.js';
import { FeeEventModel } from '../models/FeeEvent.js';
import type { ChainScanner } from '../scanners/types.js';
import { SyncStateManager } from './SyncStateManager.js';
import { isShutdownRequested } from './helpers/gracefulShutdown.js';
import { withRetry } from './helpers/retry.js';
import { sleep } from './helpers/sleep.js';

export async function runScanner(
	scanner: ChainScanner,
	pollIntervalMs: number,
	logger: pino.Logger,
): Promise<void> {
	const { chainId, startBlock, batchSize } = scanner.config;
	const chainLogger = logger.child({ chainId });

	const stellarCursor: string | undefined = await SyncStateManager.loadCursor(chainId);

	chainLogger.info('Scanner started');

	while (!isShutdownRequested()) {
		const fromBlock = await SyncStateManager.loadOrCreate(chainId, startBlock);

		let latestSafe: number;
		try {
			latestSafe = await withRetry(() => scanner.getLatestPosition(), {
				maxRetries: 5,
				retryOn: isRetryableRpcError,
			});
		} catch (err) {
			chainLogger.error({ err }, 'Failed to get latest position');
			await sleep(pollIntervalMs);
			continue;
		}

		if (fromBlock > latestSafe) {
			chainLogger.debug({ fromBlock, latestSafe }, 'Waiting for new blocks');
			await sleep(pollIntervalMs);
			continue;
		}

		const toBlock = Math.min(fromBlock + batchSize - 1, latestSafe);

		chainLogger.info(
			{ fromBlock, toBlock, blocksInBatch: toBlock - fromBlock + 1 },
			'Scanning batch',
		);

		let events: Awaited<ReturnType<typeof scanner.getEvents>> | undefined;
		try {
			events = await withRetry(() => scanner.getEvents(fromBlock, toBlock), {
				maxRetries: 5,
				baseDelayMs: 1000,
				retryOn: isRetryableRpcError,
			});
		} catch (err) {
			chainLogger.error({ err, fromBlock, toBlock }, 'Failed to fetch events after retries');
			await sleep(pollIntervalMs);
			continue;
		}

		if (events.length > 0) {
			try {
				await FeeEventModel.insertMany(events, { ordered: false });
				chainLogger.info({ eventsInserted: events.length, fromBlock, toBlock }, 'Events stored');
			} catch (err: unknown) {
				const isBulkDuplicates =
					err !== null &&
					typeof err === 'object' &&
					'code' in err &&
					(err as { code: number }).code === 11000;

				if (!isBulkDuplicates) {
					chainLogger.error(
						{ err, fromBlock, toBlock },
						'DB write failed — cursor not advanced, will retry batch',
					);
					await sleep(pollIntervalMs);
					continue;
				}

				chainLogger.debug({ fromBlock, toBlock }, 'Duplicate events skipped (expected)');
			}
		}

		await SyncStateManager.save(chainId, toBlock, stellarCursor);
	}

	chainLogger.info('Scanner stopped (shutdown requested)');
}

export async function runAllScanners(
	scanners: ChainScanner[],
	pollIntervalMs: number,
	logger: pino.Logger,
): Promise<void> {
	await Promise.all(
		scanners.map((scanner) =>
			runScanner(scanner, pollIntervalMs, logger).catch((err) => {
				logger.error({ err, chainId: scanner.config.chainId }, 'Scanner crashed');
			}),
		),
	);
}
