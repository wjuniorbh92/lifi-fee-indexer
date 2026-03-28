import type { FastifyPluginAsync } from 'fastify';
import { FeeEventModel } from '../../models/FeeEvent.js';

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 1000;
const MIN_LIMIT = 1;
const DEFAULT_OFFSET = 0;

interface EventsQuery {
	integrator: string;
	chainId?: string;
	token?: string;
	fromBlock?: string;
	toBlock?: string;
	limit?: string;
	offset?: string;
}

export const eventsRoute: FastifyPluginAsync = async (app) => {
	app.get<{ Querystring: EventsQuery }>(
		'/events',
		{
			schema: {
				querystring: {
					type: 'object',
					required: ['integrator'],
					properties: {
						integrator: { type: 'string', minLength: 1 },
						chainId: { type: 'string' },
						token: { type: 'string' },
						fromBlock: { type: 'string', pattern: '^[0-9]+$' },
						toBlock: { type: 'string', pattern: '^[0-9]+$' },
						limit: { type: 'string', pattern: '^[0-9]+$' },
						offset: { type: 'string', pattern: '^[0-9]+$' },
					},
				},
			},
		},
		async (request, reply) => {
			const { integrator, chainId, token, fromBlock, toBlock, limit, offset } = request.query;

			const parsedLimit = clampLimit(limit);
			const parsedOffset = offset ? Number(offset) : DEFAULT_OFFSET;

			const filter: Record<string, unknown> = { integrator };

			if (chainId) filter.chainId = chainId;
			if (token) filter.token = token;
			if (fromBlock || toBlock) {
				const blockFilter: Record<string, number> = {};
				if (fromBlock) blockFilter.$gte = Number(fromBlock);
				if (toBlock) blockFilter.$lte = Number(toBlock);
				filter.blockNumber = blockFilter;
			}

			const [data, total] = await Promise.all([
				FeeEventModel.find(filter)
					.sort({ blockNumber: -1 })
					.skip(parsedOffset)
					.limit(parsedLimit)
					.lean(),
				FeeEventModel.countDocuments(filter),
			]);

			return reply.send({
				data,
				pagination: {
					total,
					limit: parsedLimit,
					offset: parsedOffset,
				},
			});
		},
	);
};

function clampLimit(raw: string | undefined): number {
	if (!raw) return DEFAULT_LIMIT;
	const n = Number(raw);
	if (n < MIN_LIMIT) return MIN_LIMIT;
	if (n > MAX_LIMIT) return MAX_LIMIT;
	return n;
}
