import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { NormalizedEvent } from '../config/types.js';
import { FeeEventModel } from '../models/FeeEvent.js';
import { SyncStateModel } from '../models/SyncState.js';
import { SyncStateManager } from './SyncStateManager.js';

let mongo: MongoMemoryServer;

beforeAll(async () => {
	mongo = await MongoMemoryServer.create();
	await mongoose.connect(mongo.getUri());
});

afterAll(async () => {
	await mongoose.disconnect();
	await mongo.stop();
});

beforeEach(async () => {
	await FeeEventModel.deleteMany();
	await SyncStateModel.deleteMany();
});

function makeEvent(block: number, logIndex = 0): NormalizedEvent {
	return {
		chainId: 'polygon',
		blockNumber: block,
		transactionHash: `0xtx-${block}-${logIndex}`,
		logIndex,
		token: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
		integrator: '0xe165726007b58dab2893f85e206f20388fa2f8ce',
		integratorFee: '1000000',
		lifiFee: '50000',
		timestamp: new Date('2026-01-01T00:00:00Z'),
	};
}

describe('ScannerOrchestrator integration', () => {
	it('persists sync state and resumes from lastSyncedBlock + 1', async () => {
		await SyncStateManager.save('polygon', 78600100, undefined);

		const fromBlock = await SyncStateManager.loadOrCreate('polygon', 78600000);
		expect(fromBlock).toBe(78600101);
	});

	it('deduplicates events via insertMany ordered: false', async () => {
		const events = [makeEvent(78600100, 0), makeEvent(78600100, 1)];
		await FeeEventModel.insertMany(events, { ordered: false });

		// Insert same events again — should throw but not lose data
		try {
			await FeeEventModel.insertMany(events, { ordered: false });
		} catch {
			// expected duplicate key error
		}

		const count = await FeeEventModel.countDocuments();
		expect(count).toBe(2);
	});

	it('stores and retrieves stellar cursor', async () => {
		await SyncStateManager.save('stellar-testnet', 500100, 'cursor-abc');

		const cursor = await SyncStateManager.loadCursor('stellar-testnet');
		expect(cursor).toBe('cursor-abc');
	});

	it('handles concurrent chain sync states independently', async () => {
		await SyncStateManager.save('polygon', 78600200, undefined);
		await SyncStateManager.save('stellar-testnet', 500200, 'cursor-xyz');

		const polygonBlock = await SyncStateManager.loadOrCreate('polygon', 78600000);
		const stellarBlock = await SyncStateManager.loadOrCreate('stellar-testnet', 0);

		expect(polygonBlock).toBe(78600201);
		expect(stellarBlock).toBe(500201);
	});
});
