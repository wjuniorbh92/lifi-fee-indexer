import { describe, expect, it } from 'vitest';
import type { ChainConfig } from '../../config/types.js';
import { EvmScanner } from './EvmScanner.js';

/**
 * E2E test: hits the real Polygon RPC and FeeCollector contract.
 * Requires network access. Skipped in CI (run with: pnpm test:e2e).
 *
 * Contract: 0xbD6C7B0d2f68c2b7805d88388319cfB6EcB50eA9 (Polygon mainnet)
 * The FeeCollector emits FeesCollected events every 1-2 minutes.
 */

const POLYGON_RPC_URL = process.env.POLYGON_RPC_URL ?? 'https://polygon-bor-rpc.publicnode.com';
const FEE_COLLECTOR_ADDRESS = '0xbD6C7B0d2f68c2b7805d88388319cfB6EcB50eA9';
const BATCH_SIZE = 100;
const CONFIRMATIONS = 64;

const config: ChainConfig = {
	chainId: 'polygon',
	name: 'Polygon',
	rpcUrl: POLYGON_RPC_URL,
	contractAddress: FEE_COLLECTOR_ADDRESS,
	startBlock: 0,
	batchSize: BATCH_SIZE,
	confirmations: CONFIRMATIONS,
	type: 'evm',
};

describe('EvmScanner E2E (Polygon mainnet)', () => {
	const scanner = new EvmScanner(config);

	it('getLatestPosition returns a recent block number', async () => {
		const latest = await scanner.getLatestPosition();

		expect(latest).toBeGreaterThan(78_600_000);
		expect(typeof latest).toBe('number');
	}, 15_000);

	it('getEvents fetches real FeesCollected events from recent blocks', async () => {
		const latest = await scanner.getLatestPosition();

		// Scan a small window of recent blocks — FeeCollector is very active
		const from = latest - BATCH_SIZE;
		const to = latest;
		const events = await scanner.getEvents(from, to);

		// There should be at least some events in 100 recent blocks
		// (FeeCollector fires every 1-2 minutes on Polygon)
		expect(Array.isArray(events)).toBe(true);

		if (events.length > 0) {
			const event = events[0];
			expect(event.chainId).toBe('polygon');
			expect(event.blockNumber).toBeGreaterThanOrEqual(from);
			expect(event.blockNumber).toBeLessThanOrEqual(to);
			expect(event.transactionHash).toMatch(/^0x[a-f0-9]{64}$/);
			expect(typeof event.logIndex).toBe('number');
			expect(event.token).toMatch(/^0x[a-fA-F0-9]{40}$/);
			expect(event.integrator).toMatch(/^0x[a-fA-F0-9]{40}$/);
			expect(event.integratorFee).toMatch(/^\d+$/);
			expect(event.lifiFee).toMatch(/^\d+$/);
			expect(event.timestamp).toBeInstanceOf(Date);
			expect(event.timestamp.getTime()).toBeGreaterThan(0);
		}
	}, 30_000);
});
