import { describe, expect, it } from 'vitest';
import type { ChainConfig } from '../../config/types.js';
import type { ScanBatchResultWithCursor } from '../types.js';
import { StellarScanner } from './StellarScanner.js';

/**
 * E2E test: hits the real Stellar testnet RPC.
 * Requires network access. Skipped in CI (run with: pnpm test:e2e).
 *
 * Contract: CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC
 * Oracle/price-feed contract — emits "fee" events every ledger (~5-6s).
 */

const STELLAR_RPC_URL = 'https://soroban-testnet.stellar.org';
const ORACLE_CONTRACT =
  'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';
const CHAIN_ID = 'stellar-testnet';
const CHAIN_NAME = 'Stellar Testnet';
const E2E_BATCH_SIZE = 100;
const E2E_CONFIRMATIONS = 0;
const E2E_START_BLOCK = 0;
const MIN_EXPECTED_LEDGER = 1_000_000;
const RECENT_WINDOW = 50;
const PAGINATION_WINDOW = 30;
const SHORT_TIMEOUT = 15_000;
const LONG_TIMEOUT = 30_000;

const config: ChainConfig = {
  chainId: CHAIN_ID,
  name: CHAIN_NAME,
  rpcUrl: STELLAR_RPC_URL,
  contractAddress: ORACLE_CONTRACT,
  startBlock: E2E_START_BLOCK,
  batchSize: E2E_BATCH_SIZE,
  confirmations: E2E_CONFIRMATIONS,
  type: 'stellar',
};

describe('StellarScanner E2E (Stellar testnet)', () => {
  const scanner = new StellarScanner(config);

  it(
    'getLatestPosition returns current ledger sequence',
    async () => {
      const latest = await scanner.getLatestPosition();

      expect(latest).toBeGreaterThan(MIN_EXPECTED_LEDGER);
      expect(typeof latest).toBe('number');
    },
    SHORT_TIMEOUT,
  );

  it(
    'getEvents fetches real fee events from recent ledgers',
    async () => {
      const latest = await scanner.getLatestPosition();

      // Scan a small recent window — oracle contract is very active
      const from = latest - RECENT_WINDOW;
      const to = latest;
      const result = (await scanner.getEvents(
        from,
        to,
      )) as ScanBatchResultWithCursor;

      expect(result.events).toBeDefined();
      expect(Array.isArray(result.events)).toBe(true);

      if (result.events.length > 0) {
        const event = result.events[0];
        expect(event.chainId).toBe(CHAIN_ID);
        expect(event.blockNumber).toBeGreaterThanOrEqual(from);
        expect(event.blockNumber).toBeLessThanOrEqual(to);
        expect(event.transactionHash).toBeTruthy();
        expect(typeof event.logIndex).toBe('number');
        expect(event.token).toBe('native');
        expect(event.integrator).toMatch(/^G[A-Z0-9]{55}$/);
        expect(event.integratorFee).toMatch(/^\d+$/);
        expect(event.lifiFee).toBe('0');
        expect(event.timestamp).toBeInstanceOf(Date);
      }

      // Cursor should be returned for pagination
      if (result.events.length > 0) {
        expect(result.nextCursor).toBeTruthy();
      }
    },
    LONG_TIMEOUT,
  );

  it(
    'cursor-based pagination continues from previous position',
    async () => {
      const latest = await scanner.getLatestPosition();

      const from = latest - PAGINATION_WINDOW;
      const to = latest;

      // First fetch
      const result1 = (await scanner.getEvents(
        from,
        to,
      )) as ScanBatchResultWithCursor;

      if (result1.nextCursor) {
        // Set cursor and fetch next window
        scanner.setCursor(result1.nextCursor);
        const result2 = (await scanner.getEvents(
          to + 1,
          to + PAGINATION_WINDOW,
        )) as ScanBatchResultWithCursor;

        // Should not duplicate events from first fetch
        if (result1.events.length > 0 && result2.events.length > 0) {
          const ids1 = new Set(
            result1.events.map((e) => e.transactionHash + e.logIndex),
          );
          for (const e of result2.events) {
            expect(ids1.has(e.transactionHash + e.logIndex)).toBe(false);
          }
        }
      }
    },
    LONG_TIMEOUT,
  );
});
