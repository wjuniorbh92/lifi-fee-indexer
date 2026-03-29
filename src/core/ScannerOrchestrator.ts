import type pino from 'pino';
import { isBlockRangeRpcError, isRetryableRpcError } from '../errors/RpcError.js';
import { FeeEventModel } from '../models/FeeEvent.js';
import type { ChainScanner } from '../scanners/types.js';
import { SyncStateManager } from './SyncStateManager.js';
import { initShutdownHandler, isShutdownRequested } from './helpers/gracefulShutdown.js';
import { withRetry } from './helpers/retry.js';
import { sleep } from './helpers/sleep.js';

const SCANNER_MAX_RETRIES = 5;
const SCANNER_BASE_DELAY_MS = 1000;
const MONGO_DUPLICATE_KEY_CODE = 11000;
const MIN_BATCH_SIZE = 1;

export async function runScanner(
	scanner: ChainScanner,
	pollIntervalMs: number,
	logger: pino.Logger,
): Promise<void> {
	const { chainId, startBlock, batchSize } = scanner.config;
	const chainLogger = logger.child({ chainId });
	let currentBatchSize = batchSize;

	chainLogger.info('Scanner started');

	while (!isShutdownRequested()) {
		let fromBlock: number;
		try {
			fromBlock = await SyncStateManager.loadOrCreate(chainId, startBlock);
		} catch (err) {
			chainLogger.error({ err }, 'Failed to load sync state');
			await sleep(pollIntervalMs);
			continue;
		}

		let latestSafe: number;
		try {
			latestSafe = await withRetry(() => scanner.getLatestPosition(), {
				maxRetries: SCANNER_MAX_RETRIES,
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

		const toBlock = Math.min(fromBlock + currentBatchSize - 1, latestSafe);

		chainLogger.info(
			{ fromBlock, toBlock, blocksInBatch: toBlock - fromBlock + 1 },
			'Scanning batch',
		);

		let scanResult: Awaited<ReturnType<typeof scanner.getEvents>> | undefined;
		try {
			scanResult = await withRetry(() => scanner.getEvents(fromBlock, toBlock), {
				maxRetries: SCANNER_MAX_RETRIES,
				baseDelayMs: SCANNER_BASE_DELAY_MS,
				retryOn: (err) => isRetryableRpcError(err) && !isBlockRangeRpcError(err),
			});
		} catch (err) {
			if (isBlockRangeRpcError(err) && currentBatchSize > MIN_BATCH_SIZE) {
				const nextBatchSize = Math.max(MIN_BATCH_SIZE, Math.floor(currentBatchSize / 2));
				chainLogger.warn(
					{ err, fromBlock, toBlock, batchSize: currentBatchSize, nextBatchSize },
					'Block range too large — reducing batch size and retrying',
				);
				currentBatchSize = nextBatchSize;
				continue;
			}

			chainLogger.error({ err, fromBlock, toBlock }, 'Failed to fetch events after retries');
			await sleep(pollIntervalMs);
			continue;
		}

		const events = Array.isArray(scanResult) ? scanResult : scanResult.events;
		const nextCursor = Array.isArray(scanResult) ? undefined : scanResult.nextCursor;

		if (events.length > 0) {
			try {
				await FeeEventModel.insertMany(events, { ordered: false });
				chainLogger.info({ eventsInserted: events.length, fromBlock, toBlock }, 'Events stored');
			} catch (err: unknown) {
				const isBulkDuplicatesOnly =
					err !== null &&
					typeof err === 'object' &&
					'writeErrors' in err &&
					Array.isArray((err as { writeErrors: unknown[] }).writeErrors) &&
					(err as { writeErrors: Array<{ code: number }> }).writeErrors.length > 0 &&
					(err as { writeErrors: Array<{ code: number }> }).writeErrors.every(
						(we) => we.code === MONGO_DUPLICATE_KEY_CODE,
					);

				if (!isBulkDuplicatesOnly) {
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

		try {
			await SyncStateManager.save(chainId, toBlock, nextCursor);

			if (nextCursor && 'setCursor' in scanner && typeof scanner.setCursor === 'function') {
				scanner.setCursor(nextCursor);
			}
		} catch (err) {
			chainLogger.error(
				{ err, fromBlock, toBlock },
				'Failed to persist sync state — cursor not advanced, will retry batch',
			);
			await sleep(pollIntervalMs);
		}
	}

	chainLogger.info('Scanner stopped (shutdown requested)');
}

export async function runAllScanners(
	scanners: ChainScanner[],
	pollIntervalMs: number,
	logger: pino.Logger,
): Promise<void> {
	initShutdownHandler(logger);

	const results = await Promise.allSettled(
		scanners.map((scanner) => runScanner(scanner, pollIntervalMs, logger)),
	);

	const failures = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');

	for (const failure of failures) {
		logger.error({ err: failure.reason }, 'Scanner crashed');
	}

	if (failures.length > 0) {
		throw new Error(`${failures.length} scanner(s) crashed`);
	}
}
