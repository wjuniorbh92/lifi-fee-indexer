import type { FastifyPluginAsync } from 'fastify';
import { SyncStateModel } from '../../models/SyncState.js';
import { isDatabaseConnected } from '../../models/database.js';

const STALENESS_MULTIPLIER = 3;
const DEFAULT_POLL_INTERVAL_MS = 10_000;

export interface HealthRouteOptions {
	pollIntervalMs?: number;
}

interface ChainStatus {
	chainId: string;
	lastSyncedBlock: number;
	updatedAt: Date | undefined;
	status: 'syncing' | 'stale';
}

export const healthRoute: FastifyPluginAsync<HealthRouteOptions> = async (app, options) => {
	const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
	const stalenessThresholdMs = pollIntervalMs * STALENESS_MULTIPLIER;

	const healthResponseSchema = {
		type: 'object',
		properties: {
			status: {
				type: 'string',
				enum: ['ok', 'degraded', 'error'],
			},
			database: {
				type: 'string',
				enum: ['connected', 'disconnected'],
			},
			chains: {
				type: 'array',
				items: {
					type: 'object',
					properties: {
						chainId: { type: 'string' },
						lastSyncedBlock: { type: 'integer' },
						updatedAt: { type: 'string', format: 'date-time' },
						status: {
							type: 'string',
							enum: ['syncing', 'stale'],
						},
					},
				},
			},
		},
	};

	app.get(
		'/health',
		{
			schema: {
				response: {
					200: healthResponseSchema,
					503: healthResponseSchema,
				},
			},
		},
		async (request, reply) => {
			const dbConnected = isDatabaseConnected();

			if (!dbConnected) {
				return reply.status(503).send({
					status: 'error',
					database: 'disconnected',
					chains: [],
				});
			}

			let states: Array<{ chainId: string; lastSyncedBlock: number; updatedAt?: Date }>;
			try {
				states = await SyncStateModel.find().lean();
			} catch (err) {
				request.log.error({ err }, 'Health check DB query failed');
				return reply.status(503).send({
					status: 'error',
					database: 'connected',
					chains: [],
				});
			}
			const now = Date.now();

			const chains: ChainStatus[] = states.map((s) => {
				const updatedAt = s.updatedAt ?? undefined;
				const isStale = updatedAt !== undefined && now - updatedAt.getTime() > stalenessThresholdMs;

				return {
					chainId: s.chainId,
					lastSyncedBlock: s.lastSyncedBlock,
					updatedAt,
					status: isStale ? 'stale' : 'syncing',
				};
			});

			const hasStaleChains = chains.some((c) => c.status === 'stale');
			const status = hasStaleChains ? 'degraded' : 'ok';

			return reply.status(200).send({
				status,
				database: 'connected',
				chains,
			});
		},
	);
};
