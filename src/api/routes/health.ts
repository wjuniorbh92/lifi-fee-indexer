import type { FastifyPluginAsync } from 'fastify';
import { SyncStateModel } from '../../models/SyncState.js';
import { isDatabaseConnected } from '../../models/database.js';

interface ChainStatus {
	chainId: string;
	lastSyncedBlock: number;
	updatedAt: Date | undefined;
}

export const healthRoute: FastifyPluginAsync = async (app) => {
	app.get('/health', async (_request, reply) => {
		const dbConnected = isDatabaseConnected();

		let chains: ChainStatus[] = [];
		if (dbConnected) {
			const states = await SyncStateModel.find().lean();
			chains = states.map((s) => ({
				chainId: s.chainId,
				lastSyncedBlock: s.lastSyncedBlock,
				updatedAt: s.updatedAt ?? undefined,
			}));
		}

		const status = dbConnected ? 'ok' : 'degraded';
		const statusCode = dbConnected ? 200 : 503;

		return reply.status(statusCode).send({
			status,
			database: dbConnected ? 'connected' : 'disconnected',
			chains,
		});
	});
};
