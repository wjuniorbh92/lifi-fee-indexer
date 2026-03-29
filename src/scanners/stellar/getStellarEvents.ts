import type { rpc } from '@stellar/stellar-sdk';
import type { ChainConfig } from '../../config/types.js';

const EVENTS_LIMIT = 100;

export interface StellarEventsPage {
	events: rpc.Api.EventResponse[];
	cursor: string;
}

/**
 * Fetch contract events from Stellar RPC for a given ledger range.
 * Uses cursor-based pagination to retrieve all events in the range.
 * Returns events where ledger <= toLedger (manually filtered).
 */
export async function getStellarEvents(
	server: rpc.Server,
	config: ChainConfig,
	fromLedger: number,
	toLedger: number,
	cursor?: string,
): Promise<StellarEventsPage> {
	const allEvents: rpc.Api.EventResponse[] = [];
	let currentCursor = cursor;
	let lastCursor = currentCursor ?? '';

	const filters: rpc.Api.EventFilter[] = [
		{
			type: 'contract',
			contractIds: [config.contractAddress],
		},
	];

	while (true) {
		const request: rpc.Api.GetEventsRequest = currentCursor
			? { filters, cursor: currentCursor, limit: EVENTS_LIMIT }
			: { filters, startLedger: fromLedger, limit: EVENTS_LIMIT };

		const response = await server.getEvents(request);

		for (const event of response.events) {
			if (event.ledger > toLedger) {
				return { events: allEvents, cursor: lastCursor };
			}
			if (event.ledger < fromLedger) {
				lastCursor = event.id;
				continue;
			}
			allEvents.push(event);
			lastCursor = event.id;
		}

		if (response.events.length < EVENTS_LIMIT) {
			break;
		}

		currentCursor = response.cursor;
		if (!currentCursor) {
			break;
		}
	}

	return { events: allEvents, cursor: lastCursor };
}
