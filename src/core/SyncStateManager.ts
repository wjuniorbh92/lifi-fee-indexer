import { SyncStateModel } from '../models/SyncState.js';

const NEXT_BLOCK_OFFSET = 1;

export const SyncStateManager = {
  async loadOrCreate(chainId: string, startBlock: number): Promise<number> {
    const state = await SyncStateModel.findOne({ chainId }).lean();
    if (!state) return startBlock;
    return state.lastSyncedBlock + NEXT_BLOCK_OFFSET;
  },

  async loadCursor(chainId: string): Promise<string | undefined> {
    const state = await SyncStateModel.findOne({ chainId }).lean();
    return state?.lastCursor ?? undefined;
  },

  async save(
    chainId: string,
    lastSyncedBlock: number,
    lastCursor: string | null | undefined,
  ): Promise<void> {
    const update: Record<string, unknown> = {
      chainId,
      lastSyncedBlock,
    };
    const updateOp: Record<string, unknown> = { $set: update };
    if (lastCursor !== undefined) {
      if (lastCursor === null) {
        // Explicitly clear stale cursor (e.g. after testnet reset)
        updateOp.$unset = { lastCursor: '' };
      } else {
        update.lastCursor = lastCursor;
      }
    }
    // When lastCursor is undefined, don't touch the field
    await SyncStateModel.findOneAndUpdate({ chainId }, updateOp, {
      upsert: true,
      new: true,
    });
  },
};
