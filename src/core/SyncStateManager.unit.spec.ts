import { describe, expect, it, vi } from 'vitest';
import { SyncStateManager } from './SyncStateManager.js';

const { mockLean, mockFindOne, mockFindOneAndUpdate } = vi.hoisted(() => {
	const mockLean = vi.fn();
	const mockFindOne = vi.fn().mockReturnValue({ lean: mockLean });
	const mockFindOneAndUpdate = vi.fn();
	return { mockLean, mockFindOne, mockFindOneAndUpdate };
});

vi.mock('../models/SyncState.js', () => ({
	SyncStateModel: {
		findOne: mockFindOne,
		findOneAndUpdate: mockFindOneAndUpdate,
	},
}));

describe('SyncStateManager', () => {
	it('loadOrCreate returns startBlock when no state exists', async () => {
		mockLean.mockResolvedValue(null);

		const fromBlock = await SyncStateManager.loadOrCreate('polygon', 78600000);

		expect(fromBlock).toBe(78600000);
		expect(mockFindOne).toHaveBeenCalledWith({ chainId: 'polygon' });
	});

	it('loadOrCreate returns lastSyncedBlock + 1 when state exists', async () => {
		mockLean.mockResolvedValue({
			chainId: 'polygon',
			lastSyncedBlock: 78650000,
		});

		const fromBlock = await SyncStateManager.loadOrCreate('polygon', 78600000);

		expect(fromBlock).toBe(78650001);
	});

	it('loadCursor returns undefined when no state exists', async () => {
		mockLean.mockResolvedValue(null);
		const cursor = await SyncStateManager.loadCursor('stellar-testnet');
		expect(cursor).toBeUndefined();
	});

	it('loadCursor returns lastCursor when state exists', async () => {
		mockLean.mockResolvedValue({
			chainId: 'stellar-testnet',
			lastSyncedBlock: 1700100,
			lastCursor: 'paging-token-abc',
		});

		const cursor = await SyncStateManager.loadCursor('stellar-testnet');
		expect(cursor).toBe('paging-token-abc');
	});

	it('save upserts state with correct fields', async () => {
		mockFindOneAndUpdate.mockResolvedValue({});

		await SyncStateManager.save('polygon', 78651000, undefined);

		expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
			{ chainId: 'polygon' },
			{ $set: { chainId: 'polygon', lastSyncedBlock: 78651000 } },
			{ upsert: true, new: true },
		);
	});

	it('save includes lastCursor when provided', async () => {
		mockFindOneAndUpdate.mockResolvedValue({});

		await SyncStateManager.save('stellar-testnet', 1700200, 'paging-token-xyz');

		expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
			{ chainId: 'stellar-testnet' },
			{
				$set: {
					chainId: 'stellar-testnet',
					lastSyncedBlock: 1700200,
					lastCursor: 'paging-token-xyz',
				},
			},
			{ upsert: true, new: true },
		);
	});
});
