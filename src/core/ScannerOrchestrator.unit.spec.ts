import type pino from 'pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChainScanner } from '../scanners/types.js';
import { runScanner } from './ScannerOrchestrator.js';

const {
	mockInsertMany,
	mockLoadOrCreate,
	mockSave,
	mockWithRetry,
	mockSleep,
	mockIsShutdownRequested,
	mockInitShutdownHandler,
} = vi.hoisted(() => {
	const mockInsertMany = vi.fn();
	const mockLoadOrCreate = vi.fn();
	const mockSave = vi.fn();
	const mockWithRetry = vi.fn();
	const mockSleep = vi.fn();
	const mockIsShutdownRequested = vi.fn();
	const mockInitShutdownHandler = vi.fn();

	return {
		mockInsertMany,
		mockLoadOrCreate,
		mockSave,
		mockWithRetry,
		mockSleep,
		mockIsShutdownRequested,
		mockInitShutdownHandler,
	};
});

vi.mock('../models/FeeEvent.js', () => ({
	FeeEventModel: {
		insertMany: mockInsertMany,
	},
}));

vi.mock('./SyncStateManager.js', () => ({
	SyncStateManager: {
		loadOrCreate: mockLoadOrCreate,
		save: mockSave,
	},
}));

vi.mock('./helpers/retry.js', () => ({
	withRetry: mockWithRetry,
}));

vi.mock('./helpers/sleep.js', () => ({
	sleep: mockSleep,
}));

vi.mock('./helpers/gracefulShutdown.js', () => ({
	initShutdownHandler: mockInitShutdownHandler,
	isShutdownRequested: mockIsShutdownRequested,
}));

function createLogger(): pino.Logger {
	const chainLogger = {
		info: vi.fn(),
		debug: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	};

	return {
		child: vi.fn().mockReturnValue(chainLogger),
		info: vi.fn(),
		debug: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	} as unknown as pino.Logger;
}

describe('ScannerOrchestrator', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockWithRetry.mockImplementation(async (fn: () => Promise<unknown>) => await fn());
		mockSleep.mockResolvedValue(undefined);
		mockInsertMany.mockResolvedValue([]);
		mockLoadOrCreate.mockResolvedValue(100);
		mockSave.mockResolvedValue(undefined);
	});

	it('persists nextCursor returned by scanner batch', async () => {
		mockIsShutdownRequested.mockReturnValueOnce(false).mockReturnValueOnce(true);

		const scanner: ChainScanner = {
			config: {
				chainId: 'stellar-testnet',
				name: 'Stellar Testnet',
				rpcUrl: 'https://horizon-testnet.stellar.org',
				contractAddress: 'GABC123',
				startBlock: 0,
				batchSize: 10,
				confirmations: 0,
				type: 'stellar',
			},
			getLatestPosition: vi.fn().mockResolvedValue(110),
			getEvents: vi.fn().mockResolvedValue({
				events: [
					{
						chainId: 'stellar-testnet',
						blockNumber: 105,
						transactionHash: '0xabc',
						logIndex: 0,
						token: '0x0000000000000000000000000000000000000000',
						integrator: '0x0000000000000000000000000000000000000001',
						integratorFee: '10',
						lifiFee: '2',
						timestamp: new Date('2026-01-01T00:00:00.000Z'),
					},
				],
				nextCursor: 'cursor-2',
			}),
		};

		await runScanner(scanner, 1000, createLogger());

		expect(mockSave).toHaveBeenCalledWith('stellar-testnet', 109, 'cursor-2');
	});

	it('advances cursor when all writeErrors are duplicate key (11000)', async () => {
		mockIsShutdownRequested.mockReturnValueOnce(false).mockReturnValueOnce(true);

		const bulkError = Object.assign(new Error('BulkWriteError'), {
			writeErrors: [{ code: 11000 }, { code: 11000 }],
		});
		mockInsertMany.mockRejectedValueOnce(bulkError);

		const scanner: ChainScanner = {
			config: {
				chainId: 'polygon',
				name: 'Polygon',
				rpcUrl: 'https://polygon-rpc.com',
				contractAddress: '0xbD6C7B0d2f68c2b7805d88388319cfB6EcB50eA9',
				startBlock: 78_600_000,
				batchSize: 10,
				confirmations: 64,
				type: 'evm',
			},
			getLatestPosition: vi.fn().mockResolvedValue(110),
			getEvents: vi.fn().mockResolvedValue([
				{
					chainId: 'polygon',
					blockNumber: 105,
					transactionHash: '0xabc',
					logIndex: 0,
					token: '0x0000000000000000000000000000000000000000',
					integrator: '0x0000000000000000000000000000000000000001',
					integratorFee: '10',
					lifiFee: '2',
					timestamp: new Date('2026-01-01T00:00:00.000Z'),
				},
			]),
		};

		await runScanner(scanner, 1000, createLogger());

		expect(mockSave).toHaveBeenCalledWith('polygon', 109, undefined);
	});

	it('advances cursor when writeErrors use nested err.code shape (MongoDB driver v6)', async () => {
		mockIsShutdownRequested.mockReturnValueOnce(false).mockReturnValueOnce(true);

		const bulkError = Object.assign(new Error('MongoBulkWriteError'), {
			writeErrors: [
				{ err: { code: 11000 }, index: 0 },
				{ err: { code: 11000 }, index: 4 },
			],
		});
		mockInsertMany.mockRejectedValueOnce(bulkError);

		const scanner: ChainScanner = {
			config: {
				chainId: 'polygon',
				name: 'Polygon',
				rpcUrl: 'https://polygon-rpc.com',
				contractAddress: '0xbD6C7B0d2f68c2b7805d88388319cfB6EcB50eA9',
				startBlock: 78_600_000,
				batchSize: 10,
				confirmations: 64,
				type: 'evm',
			},
			getLatestPosition: vi.fn().mockResolvedValue(110),
			getEvents: vi.fn().mockResolvedValue([
				{
					chainId: 'polygon',
					blockNumber: 105,
					transactionHash: '0xabc',
					logIndex: 0,
					token: '0x0000000000000000000000000000000000000000',
					integrator: '0x0000000000000000000000000000000000000001',
					integratorFee: '10',
					lifiFee: '2',
					timestamp: new Date('2026-01-01T00:00:00.000Z'),
				},
			]),
		};

		await runScanner(scanner, 1000, createLogger());

		expect(mockSave).toHaveBeenCalledWith('polygon', 109, undefined);
	});

	it('does not advance cursor when writeErrors contain non-duplicate codes', async () => {
		mockIsShutdownRequested.mockReturnValueOnce(false).mockReturnValueOnce(true);

		const bulkError = Object.assign(new Error('BulkWriteError'), {
			writeErrors: [{ code: 11000 }, { code: 50 }],
		});
		mockInsertMany.mockRejectedValueOnce(bulkError);

		const scanner: ChainScanner = {
			config: {
				chainId: 'polygon',
				name: 'Polygon',
				rpcUrl: 'https://polygon-rpc.com',
				contractAddress: '0xbD6C7B0d2f68c2b7805d88388319cfB6EcB50eA9',
				startBlock: 78_600_000,
				batchSize: 10,
				confirmations: 64,
				type: 'evm',
			},
			getLatestPosition: vi.fn().mockResolvedValue(110),
			getEvents: vi.fn().mockResolvedValue([
				{
					chainId: 'polygon',
					blockNumber: 105,
					transactionHash: '0xabc',
					logIndex: 0,
					token: '0x0000000000000000000000000000000000000000',
					integrator: '0x0000000000000000000000000000000000000001',
					integratorFee: '10',
					lifiFee: '2',
					timestamp: new Date('2026-01-01T00:00:00.000Z'),
				},
			]),
		};

		await runScanner(scanner, 1000, createLogger());

		expect(mockSave).not.toHaveBeenCalled();
		expect(mockSleep).toHaveBeenCalledWith(1000);
	});

	it('retries batch when SyncStateManager.save fails after successful insert', async () => {
		mockIsShutdownRequested.mockReturnValueOnce(false).mockReturnValueOnce(true);

		mockSave.mockRejectedValueOnce(new Error('DB connection lost'));

		const scanner: ChainScanner = {
			config: {
				chainId: 'polygon',
				name: 'Polygon',
				rpcUrl: 'https://polygon-rpc.com',
				contractAddress: '0xbD6C7B0d2f68c2b7805d88388319cfB6EcB50eA9',
				startBlock: 78_600_000,
				batchSize: 10,
				confirmations: 64,
				type: 'evm',
			},
			getLatestPosition: vi.fn().mockResolvedValue(110),
			getEvents: vi.fn().mockResolvedValue([
				{
					chainId: 'polygon',
					blockNumber: 105,
					transactionHash: '0xabc',
					logIndex: 0,
					token: '0x0000000000000000000000000000000000000000',
					integrator: '0x0000000000000000000000000000000000000001',
					integratorFee: '10',
					lifiFee: '2',
					timestamp: new Date('2026-01-01T00:00:00.000Z'),
				},
			]),
		};

		await runScanner(scanner, 1000, createLogger());

		expect(mockSave).toHaveBeenCalledTimes(1);
		expect(mockSleep).toHaveBeenCalledWith(1000);
	});

	it('resets sync state when Stellar chain position is behind cursor (testnet reset)', async () => {
		// Simulate: lastSyncedBlock = 500000 (loadOrCreate returns 500001), but latest ledger is 100
		mockLoadOrCreate.mockResolvedValueOnce(500_001);

		// After reset: loadOrCreate returns the reset position + 1
		mockLoadOrCreate.mockResolvedValueOnce(101);

		// Stop after second iteration (no events to process, just verify reset happened)
		mockIsShutdownRequested
			.mockReturnValueOnce(false)
			.mockReturnValueOnce(false)
			.mockReturnValueOnce(true);

		const mockSetCursor = vi.fn();
		const scanner: ChainScanner = {
			config: {
				chainId: 'stellar-testnet',
				name: 'Stellar Testnet',
				rpcUrl: 'https://soroban-testnet.stellar.org',
				contractAddress: 'CABC123',
				startBlock: 0,
				batchSize: 10,
				confirmations: 0,
				type: 'stellar',
			},
			getLatestPosition: vi.fn().mockResolvedValue(100),
			getEvents: vi.fn().mockResolvedValue({ events: [], nextCursor: undefined }),
			setCursor: mockSetCursor,
		} as unknown as ChainScanner;

		await runScanner(scanner, 1000, createLogger());

		// Should have reset sync state to the latest position
		expect(mockSave).toHaveBeenCalledWith('stellar-testnet', 100, undefined);
		// Should have cleared the cursor
		expect(mockSetCursor).toHaveBeenCalledWith(undefined);
	});

	it('halves batch size after block-range error and retries with smaller window', async () => {
		mockIsShutdownRequested
			.mockReturnValueOnce(false)
			.mockReturnValueOnce(false)
			.mockReturnValueOnce(true);

		const scanner: ChainScanner = {
			config: {
				chainId: 'polygon',
				name: 'Polygon',
				rpcUrl: 'https://polygon-rpc.com',
				contractAddress: '0xbD6C7B0d2f68c2b7805d88388319cfB6EcB50eA9',
				startBlock: 78_600_000,
				batchSize: 8,
				confirmations: 64,
				type: 'evm',
			},
			getLatestPosition: vi.fn().mockResolvedValue(120),
			getEvents: vi
				.fn()
				.mockRejectedValueOnce(new Error('block range too large'))
				.mockResolvedValueOnce([]),
		};

		await runScanner(scanner, 1000, createLogger());

		expect(scanner.getEvents).toHaveBeenNthCalledWith(1, 100, 107);
		expect(scanner.getEvents).toHaveBeenNthCalledWith(2, 100, 103);
		expect(mockSave).toHaveBeenCalledWith('polygon', 103, undefined);
	});
});
