import type { FastifyPluginAsync } from 'fastify';
import { SyncStateModel } from '../../models/SyncState.js';
import { isDatabaseConnected } from '../../models/database.js';

export const STALENESS_MULTIPLIER = 3;

const HEALTH_STATUS_OK = 'ok' as const;
const HEALTH_STATUS_DEGRADED = 'degraded' as const;
const HEALTH_STATUS_ERROR = 'error' as const;
const DB_CONNECTED = 'connected' as const;
const DB_DISCONNECTED = 'disconnected' as const;
const CHAIN_SYNCING = 'syncing' as const;
const CHAIN_STALE = 'stale' as const;

export interface HealthRouteOptions {
	pollIntervalMs: number;
}

interface ChainStatus {
	chainId: string;
	lastSyncedBlock: number;
	updatedAt: Date | undefined;
	status: typeof CHAIN_SYNCING | typeof CHAIN_STALE;
}

export const healthRoute: FastifyPluginAsync<HealthRouteOptions> = async (app, options) => {
	const { pollIntervalMs } = options;
	const stalenessThresholdMs = pollIntervalMs * STALENESS_MULTIPLIER;

	const chainStatusSchema = {
		type: 'object',
		required: ['chainId', 'lastSyncedBlock', 'status'],
		properties: {
			chainId: { type: 'string' },
			lastSyncedBlock: { type: 'integer' },
			updatedAt: { type: 'string', format: 'date-time' },
			status: {
				type: 'string',
				enum: [CHAIN_SYNCING, CHAIN_STALE],
			},
		},
	};

	const healthOkSchema = {
		type: 'object',
		required: ['status', 'database', 'chains'],
		properties: {
			status: { type: 'string', enum: [HEALTH_STATUS_OK, HEALTH_STATUS_DEGRADED] },
			database: { type: 'string', enum: [DB_CONNECTED] },
			chains: { type: 'array', items: chainStatusSchema },
		},
	};

	const healthErrorSchema = {
		type: 'object',
		required: ['status', 'database', 'chains'],
		properties: {
			status: { type: 'string', enum: [HEALTH_STATUS_ERROR] },
			database: { type: 'string', enum: [DB_CONNECTED, DB_DISCONNECTED] },
			chains: { type: 'array', items: chainStatusSchema },
		},
	};

	app.get(
		'/health',
		{
			schema: {
				response: {
					200: healthOkSchema,
					503: healthErrorSchema,
				},
			},
		},
		async (request, reply) => {
			const dbConnected = isDatabaseConnected();

			if (!dbConnected) {
				return reply.status(503).send({
					status: HEALTH_STATUS_ERROR,
					database: DB_DISCONNECTED,
					chains: [],
				});
			}

			let states: Array<{ chainId: string; lastSyncedBlock: number; updatedAt?: Date }>;
			try {
				states = await SyncStateModel.find().lean();
			} catch (err) {
				request.log.error({ err }, 'Health check DB query failed');
				return reply.status(503).send({
					status: HEALTH_STATUS_ERROR,
					database: DB_CONNECTED,
					chains: [],
				});
			}
			const now = Date.now();

			const chains: ChainStatus[] = states.map((s) => {
				const updatedAt = s.updatedAt ?? undefined;
				// Fail closed: missing timestamp means freshness is unknown → treat as stale
				const isStale = updatedAt === undefined || now - updatedAt.getTime() > stalenessThresholdMs;

				return {
					chainId: s.chainId,
					lastSyncedBlock: s.lastSyncedBlock,
					updatedAt,
					status: isStale ? CHAIN_STALE : CHAIN_SYNCING,
				};
			});

			const hasStaleChains = chains.some((c) => c.status === CHAIN_STALE);
			const status = hasStaleChains ? HEALTH_STATUS_DEGRADED : HEALTH_STATUS_OK;

			return reply.status(200).send({
				status,
				database: DB_CONNECTED,
				chains,
			});
		},
	);
};
