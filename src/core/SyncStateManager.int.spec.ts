import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SyncStateModel } from '../models/SyncState.js';
import { SyncStateManager } from './SyncStateManager.js';

const START_BLOCK = 78600000;
const SAVED_BLOCK = 78600100;

describe('SyncStateManager (integration)', () => {
	let mongo: MongoMemoryServer | undefined;

	beforeAll(async () => {
		mongo = await MongoMemoryServer.create();
		await mongoose.connect(mongo.getUri());
	});

	afterAll(async () => {
		if (mongoose.connection.readyState !== 0) {
			await mongoose.disconnect();
		}
		await mongo?.stop();
	});

	beforeEach(async () => {
		await SyncStateModel.deleteMany();
	});

	it('returns startBlock when no sync state exists', async () => {
		const result = await SyncStateManager.loadOrCreate('polygon', START_BLOCK);
		expect(result).toBe(START_BLOCK);
	});

	it('returns lastSyncedBlock + 1 after a save', async () => {
		await SyncStateManager.save('polygon', SAVED_BLOCK, undefined);
		const result = await SyncStateManager.loadOrCreate('polygon', START_BLOCK);
		expect(result).toBe(SAVED_BLOCK + 1);
	});

	it('upserts on first save and updates on second', async () => {
		await SyncStateManager.save('polygon', SAVED_BLOCK, undefined);
		await SyncStateManager.save('polygon', SAVED_BLOCK + 50, undefined);

		const result = await SyncStateManager.loadOrCreate('polygon', START_BLOCK);
		expect(result).toBe(SAVED_BLOCK + 51);

		const count = await SyncStateModel.countDocuments({
			chainId: 'polygon',
		});
		expect(count).toBe(1);
	});

	it('persists lastCursor when provided', async () => {
		await SyncStateManager.save('polygon', SAVED_BLOCK, 'cursor-abc');
		const cursor = await SyncStateManager.loadCursor('polygon');
		expect(cursor).toBe('cursor-abc');
	});

	it('does not overwrite lastCursor when undefined is passed', async () => {
		await SyncStateManager.save('polygon', SAVED_BLOCK, 'cursor-abc');
		await SyncStateManager.save('polygon', SAVED_BLOCK + 10, undefined);

		const cursor = await SyncStateManager.loadCursor('polygon');
		expect(cursor).toBe('cursor-abc');
	});

	it('handles concurrent saves for different chains independently', async () => {
		await Promise.all([
			SyncStateManager.save('polygon', SAVED_BLOCK, undefined),
			SyncStateManager.save('stellar-testnet', SAVED_BLOCK + 200, 'stellar-cursor'),
		]);

		const polygonBlock = await SyncStateManager.loadOrCreate('polygon', START_BLOCK);
		const stellarBlock = await SyncStateManager.loadOrCreate('stellar-testnet', START_BLOCK);

		expect(polygonBlock).toBe(SAVED_BLOCK + 1);
		expect(stellarBlock).toBe(SAVED_BLOCK + 201);

		const stellarCursor = await SyncStateManager.loadCursor('stellar-testnet');
		expect(stellarCursor).toBe('stellar-cursor');
	});

	it('returns undefined cursor when no state exists', async () => {
		const cursor = await SyncStateManager.loadCursor('nonexistent');
		expect(cursor).toBeUndefined();
	});
});
