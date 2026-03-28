import type { ChainConfig, NormalizedEvent } from '../config/types.js';

export interface ChainScanner {
	readonly config: ChainConfig;

	/** Get the latest safe position (block/ledger) to scan up to. */
	getLatestPosition(): Promise<number>;

	/**
	 * Fetch events in range [from, to] inclusive.
	 * Returns normalized events ready for MongoDB insertion.
	 */
	getEvents(from: number, to: number): Promise<NormalizedEvent[]>;
}
