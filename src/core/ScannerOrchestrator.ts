import type pino from 'pino';
import {
  isBlockRangeRpcError,
  isRetryableRpcError,
} from '../errors/RpcError.js';
import { isBulkDuplicatesOnly } from '../errors/mongoErrors.js';
import { FeeEventModel } from '../models/FeeEvent.js';
import type { ChainScanner } from '../scanners/types.js';
import { metrics } from '../utils/metrics.js';
import { SyncStateManager } from './SyncStateManager.js';
import {
  initShutdownHandler,
  isShutdownRequested,
} from './helpers/gracefulShutdown.js';
import { withRetry } from './helpers/retry.js';
import { sleep } from './helpers/sleep.js';

const SCANNER_MAX_RETRIES = 5;
const SCANNER_BASE_DELAY_MS = 1000;
const MIN_BATCH_SIZE = 1;

/**
 * Main per-chain scan loop. Runs continuously until shutdown is requested.
 *
 * Flow per iteration:
 *   1. Load cursor (lastSyncedBlock + 1) from MongoDB
 *   2. Get latest safe position (head minus confirmations for EVM)
 *   3. Fetch events in [from, to] batch range
 *   4. Insert events into MongoDB (dedup via unique index)
 *   5. Advance cursor ONLY after successful insert (crash-safe)
 *
 * Resilience:
 *   - Transient RPC errors → exponential backoff retry (up to 5 attempts)
 *   - "Block range too large" → halve batch size and retry immediately
 *   - DB write failures → sleep and retry without advancing cursor
 */
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
      // Stellar testnet resets quarterly — detect when the chain has rewound
      // and reset sync state to start from the new latest position.
      if (scanner.config.type === 'stellar' && fromBlock - latestSafe > 1) {
        chainLogger.warn(
          { fromBlock, latestSafe },
          'Chain position is behind cursor — possible testnet reset, resetting sync state',
        );
        try {
          await SyncStateManager.save(chainId, latestSafe, undefined);
          if (
            'setCursor' in scanner &&
            typeof scanner.setCursor === 'function'
          ) {
            scanner.setCursor(undefined);
          }
        } catch (err) {
          chainLogger.error(
            { err, fromBlock, latestSafe },
            'Failed to persist reset sync state — will retry',
          );
          await sleep(pollIntervalMs);
        }
        continue;
      }

      chainLogger.debug({ fromBlock, latestSafe }, 'Waiting for new blocks');
      await sleep(pollIntervalMs);
      continue;
    }

    const toBlock = Math.min(fromBlock + currentBatchSize - 1, latestSafe);

    chainLogger.info(
      { fromBlock, toBlock, blocksInBatch: toBlock - fromBlock + 1 },
      'Scanning batch',
    );
    const batchStart = performance.now();

    let scanResult: Awaited<ReturnType<typeof scanner.getEvents>> | undefined;
    try {
      scanResult = await withRetry(
        () => scanner.getEvents(fromBlock, toBlock),
        {
          maxRetries: SCANNER_MAX_RETRIES,
          baseDelayMs: SCANNER_BASE_DELAY_MS,
          retryOn: (err) =>
            isRetryableRpcError(err) && !isBlockRangeRpcError(err),
        },
      );
    } catch (err) {
      // Adaptive batch halving: when the RPC rejects a range as too large,
      // halve the batch size and retry the same range — avoids skipping blocks.
      if (isBlockRangeRpcError(err) && currentBatchSize > MIN_BATCH_SIZE) {
        const nextBatchSize = Math.max(
          MIN_BATCH_SIZE,
          Math.floor(currentBatchSize / 2),
        );
        chainLogger.warn(
          {
            err,
            fromBlock,
            toBlock,
            batchSize: currentBatchSize,
            nextBatchSize,
          },
          'Block range too large — reducing batch size and retrying',
        );
        currentBatchSize = nextBatchSize;
        continue;
      }

      chainLogger.error(
        { err, fromBlock, toBlock },
        'Failed to fetch events after retries',
      );
      metrics.increment('scanner_errors_total', { chainId, type: 'rpc' });
      await sleep(pollIntervalMs);
      continue;
    }

    // EVM scanners return NormalizedEvent[]; Stellar returns { events, nextCursor }
    // for cursor-based pagination resume across restarts.
    const events = Array.isArray(scanResult) ? scanResult : scanResult.events;
    const nextCursor = Array.isArray(scanResult)
      ? undefined
      : scanResult.nextCursor;

    if (events.length > 0) {
      try {
        // ordered: false → continues inserting remaining docs after a duplicate key error,
        // so re-scanning a partial range won't fail — duplicates are silently skipped.
        await FeeEventModel.insertMany(events, { ordered: false });
        chainLogger.info(
          { eventsInserted: events.length, fromBlock, toBlock },
          'Events stored',
        );
      } catch (err: unknown) {
        if (!isBulkDuplicatesOnly(err)) {
          chainLogger.error(
            { err, fromBlock, toBlock },
            'DB write failed — cursor not advanced, will retry batch',
          );
          metrics.increment('scanner_errors_total', {
            chainId,
            type: 'db_write',
          });
          await sleep(pollIntervalMs);
          continue;
        }

        chainLogger.debug(
          { fromBlock, toBlock },
          'Duplicate events skipped (expected)',
        );
      }
    }

    try {
      await SyncStateManager.save(chainId, toBlock, nextCursor);

      if (nextCursor) {
        scanner.setCursor?.(nextCursor);
      }

      const batchDurationSec = (performance.now() - batchStart) / 1000;
      metrics.increment('scanner_batches_total', { chainId });
      metrics.observe('scanner_batch_duration_seconds', batchDurationSec, {
        chainId,
      });
      if (events.length > 0) {
        metrics.increment(
          'scanner_events_inserted_total',
          { chainId },
          events.length,
        );
      }
    } catch (err) {
      chainLogger.error(
        { err, fromBlock, toBlock },
        'Failed to persist sync state — cursor not advanced, will retry batch',
      );
      metrics.increment('scanner_errors_total', { chainId, type: 'db_save' });
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

  const failures = results.filter(
    (r): r is PromiseRejectedResult => r.status === 'rejected',
  );

  for (const failure of failures) {
    logger.error({ err: failure.reason }, 'Scanner crashed');
  }

  if (failures.length > 0) {
    throw new Error(`${failures.length} scanner(s) crashed`);
  }
}
