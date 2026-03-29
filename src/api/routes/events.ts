import type { FastifyPluginAsync } from 'fastify';
import { FeeEventModel } from '../../models/FeeEvent.js';
import { normalizeAddress } from '../../utils/normalizeAddress.js';

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 1000;
const MIN_LIMIT = 1;
const DEFAULT_OFFSET = 0;
const MAX_OFFSET = 100_000;
const SORT_DESC = -1 as const;
const SORT_ASC = 1 as const;
const CURSOR_SEPARATOR = ':';
const CURSOR_PARTS_COUNT = 3;

interface EventsQuery {
	integrator: string;
	chainId?: string;
	token?: string;
	fromBlock?: string;
	toBlock?: string;
	limit?: string;
	offset?: string;
	cursor?: string;
}

interface CursorPosition {
	blockNumber: number;
	transactionHash: string;
	logIndex: number;
}

function encodeCursor(event: {
	blockNumber: number;
	transactionHash: string;
	logIndex: number;
}): string {
	const raw = `${event.blockNumber}${CURSOR_SEPARATOR}${event.transactionHash}${CURSOR_SEPARATOR}${event.logIndex}`;
	return Buffer.from(raw).toString('base64url');
}

function decodeCursor(cursor: string | undefined): CursorPosition | undefined {
	if (!cursor) return undefined;
	try {
		const raw = Buffer.from(cursor, 'base64url').toString();
		const parts = raw.split(CURSOR_SEPARATOR);
		if (parts.length < CURSOR_PARTS_COUNT) return undefined;
		const blockNumber = Number(parts[0]);
		const logIndex = Number(parts[parts.length - 1]);
		const transactionHash = parts.slice(1, parts.length - 1).join(CURSOR_SEPARATOR);
		if (!Number.isFinite(blockNumber) || !Number.isFinite(logIndex)) return undefined;
		return { blockNumber, transactionHash, logIndex };
	} catch {
		return undefined;
	}
}

function pickBaseFilters(
	chainId?: string,
	token?: string,
	fromBlock?: string,
	toBlock?: string,
): Record<string, unknown> {
	const filter: Record<string, unknown> = {};
	if (chainId) filter.chainId = chainId;
	if (token) filter.token = normalizeAddress(token);
	if (fromBlock || toBlock) {
		const blockFilter: Record<string, number> = {};
		if (fromBlock) blockFilter.$gte = Number(fromBlock);
		if (toBlock) blockFilter.$lte = Number(toBlock);
		filter.blockNumber = blockFilter;
	}
	return filter;
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
						cursor: { type: 'string' },
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
							pagination: {
								type: 'object',
								properties: {
									total: { type: 'integer' },
									limit: { type: 'integer' },
									offset: { type: 'integer' },
									nextCursor: { type: 'string' },
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
				},
			},
		},
		async (request, reply) => {
			const { integrator, chainId, token, fromBlock, toBlock, limit, offset, cursor } =
				request.query;

			const parsedLimit = clampLimit(limit);
			const cursorPosition = decodeCursor(cursor);
			const parsedOffset = cursor ? 0 : clampOffset(offset);

			const integratorMatch = normalizeAddress(integrator);

			const filter: Record<string, unknown> = {
				integrator: integratorMatch,
				...pickBaseFilters(chainId, token, fromBlock, toBlock),
			};

			if (cursorPosition) {
				filter.$or = [
					{ blockNumber: { $lt: cursorPosition.blockNumber } },
					{
						blockNumber: cursorPosition.blockNumber,
						transactionHash: { $gt: cursorPosition.transactionHash },
					},
					{
						blockNumber: cursorPosition.blockNumber,
						transactionHash: cursorPosition.transactionHash,
						logIndex: { $gt: cursorPosition.logIndex },
					},
				];
			}

			const baseFilter: Record<string, unknown> = {
				integrator: integratorMatch,
				...pickBaseFilters(chainId, token, fromBlock, toBlock),
			};

			const [data, total] = await Promise.all([
				FeeEventModel.find(filter, { _id: 0 })
					.sort({
						blockNumber: SORT_DESC,
						transactionHash: SORT_ASC,
						logIndex: SORT_ASC,
					})
					.skip(parsedOffset)
					.limit(parsedLimit)
					.lean(),
				FeeEventModel.countDocuments(cursorPosition ? baseFilter : filter),
			]);

			const nextCursor =
				data.length === parsedLimit
					? encodeCursor(
							data[data.length - 1] as {
								blockNumber: number;
								transactionHash: string;
								logIndex: number;
							},
						)
					: undefined;

			const pagination: Record<string, unknown> = {
				total,
				limit: parsedLimit,
				offset: parsedOffset,
			};
			if (nextCursor !== undefined) {
				pagination.nextCursor = nextCursor;
			}

			return reply.send({ data, pagination });
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

function clampOffset(raw: string | undefined): number {
	if (!raw) return DEFAULT_OFFSET;
	const n = Number(raw);
	if (n < DEFAULT_OFFSET) return DEFAULT_OFFSET;
	if (n > MAX_OFFSET) return MAX_OFFSET;
	return n;
}
