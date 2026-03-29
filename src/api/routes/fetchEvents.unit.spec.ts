import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChainConfig, NormalizedEvent } from '../../config/types.js';
import type { ChainScanner, ScanBatchResult } from '../../scanners/types.js';

const MOCK_BLOCK_FROM = 78600000;
const MOCK_BLOCK_TO = 78600100;

const { mockInsertMany } = vi.hoisted(() => {
	const mockInsertMany = vi.fn();
	return { mockInsertMany };
});

vi.mock('../../models/FeeEvent.js', () => ({
	FeeEventModel: {
		insertMany: mockInsertMany,
	},
}));

vi.mock('../../models/SyncState.js', () => ({
	SyncStateModel: {
		find: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }),
	},
}));

vi.mock('../../models/database.js', () => ({
	isDatabaseConnected: vi.fn().mockReturnValue(true),
}));

vi.mock('../../core/helpers/retry.js', () => ({
	withRetry: vi.fn((fn: () => Promise<unknown>) => fn()),
}));

const MOCK_EVENT: NormalizedEvent = {
	chainId: 'polygon',
	blockNumber: MOCK_BLOCK_FROM,
	transactionHash: '0xabc',
	logIndex: 0,
	token: '0x2791bca1f2de4661ed88a30c99a7a9449aa84174',
	integrator: '0xe165726007b58dab2893f85e206f20388fa2f8ce',
	integratorFee: '1000000',
	lifiFee: '50000',
	timestamp: new Date('2026-01-01T00:00:00.000Z'),
};

function createMockScanner(getEventsResult: ScanBatchResult = [MOCK_EVENT]): ChainScanner {
	return {
		config: {
			chainId: 'polygon',
			name: 'Polygon',
			rpcUrl: 'https://rpc.example.com',
			contractAddress: '0x0000000000000000000000000000000000000000',
			startBlock: 0,
			batchSize: 2000,
			confirmations: 64,
			type: 'evm',
		} satisfies ChainConfig,
		getLatestPosition: vi.fn().mockResolvedValue(99999999),
		getEvents: vi.fn().mockResolvedValue(getEventsResult),
	};
}

async function buildApp(scanners: Map<string, ChainScanner>) {
	const { buildServer } = await import('../server.js');
	return buildServer({ scanners });
}

describe('POST /events/fetch', () => {
	beforeEach(() => {
		mockInsertMany.mockReset();
	});
	it('fetches events from RPC, stores them, and returns them', async () => {
		const scanner = createMockScanner();
		const scanners = new Map([['polygon', scanner]]);
		mockInsertMany.mockResolvedValueOnce([MOCK_EVENT]);

		const app = await buildApp(scanners);
		const response = await app.inject({
			method: 'POST',
			url: '/events/fetch',
			payload: {
				chainId: 'polygon',
				fromBlock: MOCK_BLOCK_FROM,
				toBlock: MOCK_BLOCK_TO,
			},
		});

		expect(response.statusCode).toBe(200);
		const body = response.json();
		expect(body.data).toHaveLength(1);
		expect(body.meta).toEqual({
			chainId: 'polygon',
			fromBlock: MOCK_BLOCK_FROM,
			toBlock: MOCK_BLOCK_TO,
			count: 1,
		});
		expect(scanner.getEvents).toHaveBeenCalledWith(MOCK_BLOCK_FROM, MOCK_BLOCK_TO);
		expect(mockInsertMany).toHaveBeenCalledWith([MOCK_EVENT], {
			ordered: false,
		});
	});

	it('handles Stellar cursor-based response shape', async () => {
		const stellarEvent = { ...MOCK_EVENT, chainId: 'stellar-testnet' };
		const scanner = createMockScanner({
			events: [stellarEvent],
			nextCursor: 'abc123',
		});
		scanner.config = {
			...scanner.config,
			chainId: 'stellar-testnet',
			type: 'stellar',
		};
		const scanners = new Map([['stellar-testnet', scanner]]);
		mockInsertMany.mockResolvedValueOnce([stellarEvent]);

		const app = await buildApp(scanners);
		const response = await app.inject({
			method: 'POST',
			url: '/events/fetch',
			payload: { chainId: 'stellar-testnet', fromBlock: 100, toBlock: 200 },
		});

		expect(response.statusCode).toBe(200);
		const body = response.json();
		expect(body.data).toHaveLength(1);
		expect(body.meta.count).toBe(1);
	});

	it('returns 400 for unknown chainId', async () => {
		const scanners = new Map([['polygon', createMockScanner()]]);

		const app = await buildApp(scanners);
		const response = await app.inject({
			method: 'POST',
			url: '/events/fetch',
			payload: { chainId: 'ethereum', fromBlock: 0, toBlock: 100 },
		});

		expect(response.statusCode).toBe(400);
		const body = response.json();
		expect(body.error).toContain('Unknown chainId');
		expect(body.error).toContain('polygon');
		expect(body.code).toBe('UNKNOWN_CHAIN');
	});

	it('returns 400 when fromBlock > toBlock', async () => {
		const scanners = new Map([['polygon', createMockScanner()]]);

		const app = await buildApp(scanners);
		const response = await app.inject({
			method: 'POST',
			url: '/events/fetch',
			payload: { chainId: 'polygon', fromBlock: 200, toBlock: 100 },
		});

		expect(response.statusCode).toBe(400);
		const body = response.json();
		expect(body.error).toContain('fromBlock must be less than or equal to toBlock');
		expect(body.code).toBe('BLOCK_RANGE_INVALID');
	});

	it('returns 400 when range exceeds maximum', async () => {
		const scanners = new Map([['polygon', createMockScanner()]]);

		const app = await buildApp(scanners);
		const response = await app.inject({
			method: 'POST',
			url: '/events/fetch',
			payload: { chainId: 'polygon', fromBlock: 0, toBlock: 20000 },
		});

		expect(response.statusCode).toBe(400);
		const body = response.json();
		expect(body.error).toContain('Block range too large');
		expect(body.code).toBe('BLOCK_RANGE_TOO_LARGE');
	});

	it('returns 400 when required fields are missing', async () => {
		const scanners = new Map([['polygon', createMockScanner()]]);

		const app = await buildApp(scanners);
		const response = await app.inject({
			method: 'POST',
			url: '/events/fetch',
			payload: { chainId: 'polygon' },
		});

		expect(response.statusCode).toBe(400);
	});

	it('returns 502 when RPC fetch fails', async () => {
		const scanner = createMockScanner();
		(scanner.getEvents as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('RPC timeout'));
		const scanners = new Map([['polygon', scanner]]);

		// Override withRetry to propagate the error
		const { withRetry } = await import('../../core/helpers/retry.js');
		(withRetry as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('RPC timeout'));

		const app = await buildApp(scanners);
		const response = await app.inject({
			method: 'POST',
			url: '/events/fetch',
			payload: {
				chainId: 'polygon',
				fromBlock: MOCK_BLOCK_FROM,
				toBlock: MOCK_BLOCK_TO,
			},
		});

		expect(response.statusCode).toBe(502);
		const body = response.json();
		expect(body.error).toContain('Failed to fetch events from RPC');
		expect(body.code).toBe('RPC_FETCH_FAILED');
	});

	it('handles duplicate key errors gracefully', async () => {
		const scanner = createMockScanner();
		const scanners = new Map([['polygon', scanner]]);

		const duplicateError = new Error('E11000 duplicate key');
		Object.assign(duplicateError, {
			writeErrors: [{ code: 11000 }],
		});
		mockInsertMany.mockRejectedValueOnce(duplicateError);

		const app = await buildApp(scanners);
		const response = await app.inject({
			method: 'POST',
			url: '/events/fetch',
			payload: {
				chainId: 'polygon',
				fromBlock: MOCK_BLOCK_FROM,
				toBlock: MOCK_BLOCK_TO,
			},
		});

		expect(response.statusCode).toBe(200);
		const body = response.json();
		expect(body.data).toHaveLength(1);
	});

	it('returns 500 when DB write fails with non-duplicate error', async () => {
		const scanner = createMockScanner();
		const scanners = new Map([['polygon', scanner]]);
		mockInsertMany.mockRejectedValueOnce(new Error('Connection lost'));

		const app = await buildApp(scanners);
		const response = await app.inject({
			method: 'POST',
			url: '/events/fetch',
			payload: {
				chainId: 'polygon',
				fromBlock: MOCK_BLOCK_FROM,
				toBlock: MOCK_BLOCK_TO,
			},
		});

		expect(response.statusCode).toBe(500);
		const body = response.json();
		expect(body.error).toContain('Failed to store fetched events');
		expect(body.code).toBe('DB_WRITE_FAILED');
	});

	it('returns empty data when no events found in range', async () => {
		const scanner = createMockScanner([]);
		const scanners = new Map([['polygon', scanner]]);

		const app = await buildApp(scanners);
		const response = await app.inject({
			method: 'POST',
			url: '/events/fetch',
			payload: {
				chainId: 'polygon',
				fromBlock: MOCK_BLOCK_FROM,
				toBlock: MOCK_BLOCK_TO,
			},
		});

		expect(response.statusCode).toBe(200);
		const body = response.json();
		expect(body.data).toEqual([]);
		expect(body.meta.count).toBe(0);
		expect(mockInsertMany).not.toHaveBeenCalled();
	});
});
