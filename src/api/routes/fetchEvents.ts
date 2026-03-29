import type { FastifyPluginAsync } from 'fastify';
import { withRetry } from '../../core/helpers/retry.js';
import { isRetryableRpcError } from '../../errors/RpcError.js';
import { FeeEventModel } from '../../models/FeeEvent.js';
import type { ChainScanner } from '../../scanners/types.js';

const MAX_ON_DEMAND_RANGE = 10_000;
const FETCH_MAX_RETRIES = 3;
const MONGO_DUPLICATE_KEY_CODE = 11000;

interface FetchEventsBody {
	chainId: string;
	fromBlock: number;
	toBlock: number;
}

export interface FetchEventsRouteOptions {
	scanners: Map<string, ChainScanner>;
}

export const fetchEventsRoute: FastifyPluginAsync<FetchEventsRouteOptions> = async (
	app,
	options,
) => {
	const { scanners } = options;

	app.post<{ Body: FetchEventsBody }>(
		'/events/fetch',
		{
			schema: {
				body: {
					type: 'object',
					required: ['chainId', 'fromBlock', 'toBlock'],
					properties: {
						chainId: { type: 'string', minLength: 1 },
						fromBlock: { type: 'integer', minimum: 0 },
						toBlock: { type: 'integer', minimum: 0 },
					},
				},
			},
		},
		async (request, reply) => {
			const { chainId, fromBlock, toBlock } = request.body;

			if (fromBlock > toBlock) {
				return reply.status(400).send({
					error: 'fromBlock must be less than or equal to toBlock',
				});
			}

			const range = toBlock - fromBlock + 1;
			if (range > MAX_ON_DEMAND_RANGE) {
				return reply.status(400).send({
					error: `Block range too large: ${range} exceeds maximum of ${MAX_ON_DEMAND_RANGE}`,
				});
			}

			const scanner = scanners.get(chainId);
			if (!scanner) {
				const available = [...scanners.keys()].join(', ');
				return reply.status(400).send({
					error: `Unknown chainId: "${chainId}". Available chains: ${available}`,
				});
			}

			let scanResult: Awaited<ReturnType<typeof scanner.getEvents>>;
			try {
				scanResult = await withRetry(() => scanner.getEvents(fromBlock, toBlock), {
					maxRetries: FETCH_MAX_RETRIES,
					retryOn: isRetryableRpcError,
				});
			} catch (err) {
				request.log.error({ err, chainId, fromBlock, toBlock }, 'On-demand RPC fetch failed');
				return reply.status(502).send({
					error: 'Failed to fetch events from RPC after retries',
				});
			}

			const events = Array.isArray(scanResult) ? scanResult : scanResult.events;

			if (events.length > 0) {
				try {
					await FeeEventModel.insertMany(events, { ordered: false });
				} catch (err: unknown) {
					const isBulkDuplicatesOnly =
						err !== null &&
						typeof err === 'object' &&
						'writeErrors' in err &&
						Array.isArray((err as { writeErrors: unknown[] }).writeErrors) &&
						(
							err as {
								writeErrors: Array<{ code?: number; err?: { code: number } }>;
							}
						).writeErrors.length > 0 &&
						(
							err as {
								writeErrors: Array<{ code?: number; err?: { code: number } }>;
							}
						).writeErrors.every(
							(we) =>
								we.code === MONGO_DUPLICATE_KEY_CODE || we.err?.code === MONGO_DUPLICATE_KEY_CODE,
						);

					if (!isBulkDuplicatesOnly) {
						request.log.error(
							{ err, chainId, fromBlock, toBlock },
							'DB write failed during on-demand fetch',
						);
						return reply.status(500).send({
							error: 'Failed to store fetched events',
						});
					}

					request.log.debug(
						{ chainId, fromBlock, toBlock },
						'Some duplicate events skipped during on-demand fetch',
					);
				}
			}

			return reply.send({
				data: events,
				meta: {
					chainId,
					fromBlock,
					toBlock,
					count: events.length,
				},
			});
		},
	);
};
