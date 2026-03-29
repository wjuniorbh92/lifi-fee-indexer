import { rpc } from '@stellar/stellar-sdk';
import type { ChainConfig, NormalizedEvent } from '../../config/types.js';
import type { ChainScanner, ScanBatchResultWithCursor } from '../types.js';
import { decodeStellarEvent } from './decodeStellarEvent.js';
import { getStellarEvents } from './getStellarEvents.js';

export class StellarScanner implements ChainScanner {
	readonly config: ChainConfig;
	private readonly server: rpc.Server;
	private cursor: string | undefined;

	constructor(config: ChainConfig, server?: rpc.Server) {
		this.config = config;
		this.server = server ?? new rpc.Server(config.rpcUrl, { allowHttp: true });
	}

	setCursor(cursor: string | undefined): void {
		this.cursor = cursor;
	}

	async getLatestPosition(): Promise<number> {
		const ledger = await this.server.getLatestLedger();
		return ledger.sequence;
	}

	async getEvents(from: number, to: number): Promise<ScanBatchResultWithCursor> {
		if (from > to) {
			throw new RangeError(`Invalid ledger range: from (${from}) > to (${to})`);
		}

		const page = await getStellarEvents(this.server, this.config, from, to, this.cursor);

		const events: NormalizedEvent[] = page.events.map((event) =>
			decodeStellarEvent(event, this.config.chainId),
		);

		return {
			events,
			nextCursor: page.cursor.length > 0 ? page.cursor : undefined,
		};
	}
}
