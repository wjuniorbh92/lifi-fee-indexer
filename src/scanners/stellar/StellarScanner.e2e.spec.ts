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

const config: ChainConfig = {
  chainId: 'stellar-testnet',
  name: 'Stellar Testnet',
  rpcUrl: STELLAR_RPC_URL,
  contractAddress: ORACLE_CONTRACT,
  startBlock: 0,
  batchSize: 100,
  confirmations: 0,
  type: 'stellar',
};

describe('StellarScanner E2E (Stellar testnet)', () => {
  const scanner = new StellarScanner(config);

  it('getLatestPosition returns current ledger sequence', async () => {
    const latest = await scanner.getLatestPosition();

    expect(latest).toBeGreaterThan(1_000_000);
    expect(typeof latest).toBe('number');
  }, 15_000);

  it('getEvents fetches real fee events from recent ledgers', async () => {
    const latest = await scanner.getLatestPosition();

    // Scan a small recent window — oracle contract is very active
    const from = latest - 50;
    const to = latest;
    const result = (await scanner.getEvents(
      from,
      to,
    )) as ScanBatchResultWithCursor;

    expect(result.events).toBeDefined();
    expect(Array.isArray(result.events)).toBe(true);

    if (result.events.length > 0) {
      const event = result.events[0];
      expect(event.chainId).toBe('stellar-testnet');
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
  }, 30_000);

  it('cursor-based pagination continues from previous position', async () => {
    const latest = await scanner.getLatestPosition();

    const from = latest - 30;
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
        to + 30,
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
  }, 30_000);
});
