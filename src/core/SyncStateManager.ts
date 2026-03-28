import { SyncStateModel } from '../models/SyncState.js';

export const SyncStateManager = {
	async loadOrCreate(chainId: string, startBlock: number): Promise<number> {
		const state = await SyncStateModel.findOne({ chainId }).lean();
		if (!state) return startBlock;
		return state.lastSyncedBlock + 1;
	},

	async loadCursor(chainId: string): Promise<string | undefined> {
		const state = await SyncStateModel.findOne({ chainId }).lean();
		return state?.lastCursor ?? undefined;
	},

	async save(
		chainId: string,
		lastSyncedBlock: number,
		lastCursor: string | undefined,
	): Promise<void> {
		const update: Record<string, unknown> = {
			chainId,
			lastSyncedBlock,
		};
		if (lastCursor !== undefined) {
			update.lastCursor = lastCursor;
		}
		await SyncStateModel.findOneAndUpdate({ chainId }, update, {
			upsert: true,
			new: true,
		});
	},
};
