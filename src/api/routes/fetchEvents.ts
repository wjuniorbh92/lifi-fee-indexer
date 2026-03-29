import type { FastifyPluginAsync } from 'fastify';
import { withRetry } from '../../core/helpers/retry.js';
import { isRetryableRpcError } from '../../errors/RpcError.js';
import { isBulkDuplicatesOnly } from '../../errors/mongoErrors.js';
import { FeeEventModel } from '../../models/FeeEvent.js';
import type { ChainScanner } from '../../scanners/types.js';
import { ApiErrorCode, sendError } from '../helpers/errorResponse.js';

const MAX_ON_DEMAND_RANGE = 10_000;
const FETCH_MAX_RETRIES = 3;

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
				response: {
					200: {
						type: 'object',
						properties: {
							data: {
								type: 'array',
								items: {
									type: 'object',
									additionalProperties: true,
								},
							},
							meta: {
								type: 'object',
								properties: {
									chainId: { type: 'string' },
									fromBlock: { type: 'integer' },
									toBlock: { type: 'integer' },
									count: { type: 'integer' },
								},
							},
						},
					},
					400: {
						type: 'object',
						required: ['error', 'code'],
						properties: {
							error: { type: 'string' },
							code: { type: 'string' },
						},
					},
					500: {
						type: 'object',
						required: ['error', 'code'],
						properties: {
							error: { type: 'string' },
							code: { type: 'string' },
						},
					},
					502: {
						type: 'object',
						required: ['error', 'code'],
						properties: {
							error: { type: 'string' },
							code: { type: 'string' },
						},
					},
				},
			},
		},
		async (request, reply) => {
			const { chainId, fromBlock, toBlock } = request.body;

			if (fromBlock > toBlock) {
				return sendError(
					reply,
					400,
					'fromBlock must be less than or equal to toBlock',
					ApiErrorCode.BLOCK_RANGE_INVALID,
				);
			}

			const range = toBlock - fromBlock + 1;
			if (range > MAX_ON_DEMAND_RANGE) {
				return sendError(
					reply,
					400,
					`Block range too large: ${range} exceeds maximum of ${MAX_ON_DEMAND_RANGE}`,
					ApiErrorCode.BLOCK_RANGE_TOO_LARGE,
				);
			}

			const scanner = scanners.get(chainId);
			if (!scanner) {
				const available = [...scanners.keys()].join(', ');
				return sendError(
					reply,
					400,
					`Unknown chainId: "${chainId}". Available chains: ${available}`,
					ApiErrorCode.UNKNOWN_CHAIN,
				);
			}

			let scanResult: Awaited<ReturnType<typeof scanner.getEvents>>;
			try {
				scanResult = await withRetry(() => scanner.getEvents(fromBlock, toBlock), {
					maxRetries: FETCH_MAX_RETRIES,
					retryOn: isRetryableRpcError,
				});
			} catch (err) {
				request.log.error({ err, chainId, fromBlock, toBlock }, 'On-demand RPC fetch failed');
				return sendError(
					reply,
					502,
					'Failed to fetch events from RPC after retries',
					ApiErrorCode.RPC_FETCH_FAILED,
				);
			}

			const events = Array.isArray(scanResult) ? scanResult : scanResult.events;

			if (events.length > 0) {
				try {
					await FeeEventModel.insertMany(events, { ordered: false });
				} catch (err: unknown) {
					if (!isBulkDuplicatesOnly(err)) {
						request.log.error(
							{ err, chainId, fromBlock, toBlock },
							'DB write failed during on-demand fetch',
						);
						return sendError(
							reply,
							500,
							'Failed to store fetched events',
							ApiErrorCode.DB_WRITE_FAILED,
						);
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
