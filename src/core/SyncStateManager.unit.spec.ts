import { describe, expect, it, vi } from 'vitest';
import { SyncStateManager } from './SyncStateManager.js';

const CHAIN_POLYGON = 'polygon';
const CHAIN_STELLAR = 'stellar-testnet';
const POLYGON_START_BLOCK = 78_600_000;
const POLYGON_SYNCED_BLOCK = 78_650_000;
const POLYGON_SAVE_BLOCK = 78_651_000;
const STELLAR_SYNCED_BLOCK = 1_700_100;
const STELLAR_SAVE_BLOCK = 1_700_200;
const TEST_CURSOR = 'paging-token-abc';
const TEST_CURSOR_NEW = 'paging-token-xyz';

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

    const fromBlock = await SyncStateManager.loadOrCreate(
      CHAIN_POLYGON,
      POLYGON_START_BLOCK,
    );

    expect(fromBlock).toBe(POLYGON_START_BLOCK);
    expect(mockFindOne).toHaveBeenCalledWith({ chainId: CHAIN_POLYGON });
  });

  it('loadOrCreate returns lastSyncedBlock + 1 when state exists', async () => {
    mockLean.mockResolvedValue({
      chainId: CHAIN_POLYGON,
      lastSyncedBlock: POLYGON_SYNCED_BLOCK,
    });

    const fromBlock = await SyncStateManager.loadOrCreate(
      CHAIN_POLYGON,
      POLYGON_START_BLOCK,
    );

    expect(fromBlock).toBe(POLYGON_SYNCED_BLOCK + 1);
  });

  it('loadCursor returns undefined when no state exists', async () => {
    mockLean.mockResolvedValue(null);
    const cursor = await SyncStateManager.loadCursor(CHAIN_STELLAR);
    expect(cursor).toBeUndefined();
  });

  it('loadCursor returns lastCursor when state exists', async () => {
    mockLean.mockResolvedValue({
      chainId: CHAIN_STELLAR,
      lastSyncedBlock: STELLAR_SYNCED_BLOCK,
      lastCursor: TEST_CURSOR,
    });

    const cursor = await SyncStateManager.loadCursor(CHAIN_STELLAR);
    expect(cursor).toBe(TEST_CURSOR);
  });

  it('save upserts state with correct fields', async () => {
    mockFindOneAndUpdate.mockResolvedValue({});

    await SyncStateManager.save(CHAIN_POLYGON, POLYGON_SAVE_BLOCK, undefined);

    expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
      { chainId: CHAIN_POLYGON },
      {
        $set: {
          chainId: CHAIN_POLYGON,
          lastSyncedBlock: POLYGON_SAVE_BLOCK,
        },
        $unset: { lastCursor: '' },
      },
      { upsert: true, new: true },
    );
  });

  it('save includes lastCursor when provided', async () => {
    mockFindOneAndUpdate.mockResolvedValue({});

    await SyncStateManager.save(
      CHAIN_STELLAR,
      STELLAR_SAVE_BLOCK,
      TEST_CURSOR_NEW,
    );

    expect(mockFindOneAndUpdate).toHaveBeenCalledWith(
      { chainId: CHAIN_STELLAR },
      {
        $set: {
          chainId: CHAIN_STELLAR,
          lastSyncedBlock: STELLAR_SAVE_BLOCK,
          lastCursor: TEST_CURSOR_NEW,
        },
      },
      { upsert: true, new: true },
    );
  });
});
