import type { ChainConfig, NormalizedEvent } from '../config/types.js';

export interface ScanBatchResultWithCursor {
  events: NormalizedEvent[];
  nextCursor?: string;
}

export type ScanBatchResult = NormalizedEvent[] | ScanBatchResultWithCursor;

export interface ChainScanner {
  readonly config: ChainConfig;

  /** Get the latest safe position (block/ledger) to scan up to. */
  getLatestPosition(): Promise<number>;

  /**
   * Fetch events in range [from, to] inclusive.
   * Returns normalized events ready for MongoDB insertion.
   * Cursor-based chains may also return `nextCursor` metadata.
   */
  getEvents(from: number, to: number): Promise<ScanBatchResult>;

  /** Optional: set resume cursor for cursor-based chains (e.g. Stellar). */
  setCursor?(cursor: string | undefined): void;
}
