import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { FeeEventModel } from '../../models/FeeEvent.js';
import { SyncStateModel } from '../../models/SyncState.js';
import { buildServer } from '../server.js';

const MOCK_BASE_BLOCK = 78600100;
const MOCK_BLOCK_OFFSET_100 = 78600200;
const MOCK_BLOCK_OFFSET_200 = 78600300;
const MOCK_HEALTH_BLOCK = 78600500;
const EXPECTED_DEFAULT_LIMIT = 100;

let mongo: MongoMemoryServer;

beforeAll(async () => {
	mongo = await MongoMemoryServer.create();
	await mongoose.connect(mongo.getUri());
});

afterAll(async () => {
	await mongoose.disconnect();
	await mongo.stop();
});

beforeEach(async () => {
	await FeeEventModel.deleteMany();
	await SyncStateModel.deleteMany();
});

function makeEvent(overrides: Partial<Record<string, unknown>> = {}) {
	return {
		chainId: 'polygon',
		blockNumber: MOCK_BASE_BLOCK,
		transactionHash: '0xabc123',
		logIndex: 0,
		token: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
		integrator: '0xe165726007b58dab2893f85e206f20388fa2f8ce',
		integratorFee: '1000000',
		lifiFee: '50000',
		timestamp: new Date('2026-01-01T00:00:00Z'),
		...overrides,
	};
}

describe('GET /events (integration)', () => {
	it('returns inserted events with pagination', async () => {
		await FeeEventModel.insertMany([
			makeEvent({ logIndex: 0, blockNumber: MOCK_BASE_BLOCK }),
			makeEvent({ logIndex: 1, blockNumber: MOCK_BASE_BLOCK + 1 }),
			makeEvent({ logIndex: 2, blockNumber: MOCK_BASE_BLOCK + 2 }),
		]);

		const app = await buildServer();
		const response = await app.inject({
			method: 'GET',
			url: '/events?integrator=0xe165726007b58dab2893f85e206f20388fa2f8ce',
		});

		expect(response.statusCode).toBe(200);
		const body = response.json();
		expect(body.data).toHaveLength(3);
		expect(body.pagination).toEqual({
			total: 3,
			limit: EXPECTED_DEFAULT_LIMIT,
			offset: 0,
		});
		// Sorted by blockNumber descending
		expect(body.data[0].blockNumber).toBe(MOCK_BASE_BLOCK + 2);
		expect(body.data[2].blockNumber).toBe(MOCK_BASE_BLOCK);
	});

	it('filters by chainId', async () => {
		await FeeEventModel.insertMany([
			makeEvent({ chainId: 'polygon', logIndex: 0 }),
			makeEvent({ chainId: 'stellar-testnet', logIndex: 1 }),
		]);

		const app = await buildServer();
		const response = await app.inject({
			method: 'GET',
			url: '/events?integrator=0xe165726007b58dab2893f85e206f20388fa2f8ce&chainId=polygon',
		});

		const body = response.json();
		expect(body.data).toHaveLength(1);
		expect(body.data[0].chainId).toBe('polygon');
		expect(body.pagination.total).toBe(1);
	});

	it('filters by block range', async () => {
		await FeeEventModel.insertMany([
			makeEvent({ blockNumber: MOCK_BASE_BLOCK, logIndex: 0 }),
			makeEvent({ blockNumber: MOCK_BLOCK_OFFSET_100, logIndex: 1 }),
			makeEvent({ blockNumber: MOCK_BLOCK_OFFSET_200, logIndex: 2 }),
		]);

		const app = await buildServer();
		const response = await app.inject({
			method: 'GET',
			url: '/events?integrator=0xe165726007b58dab2893f85e206f20388fa2f8ce&fromBlock=78600150&toBlock=78600250',
		});

		const body = response.json();
		expect(body.data).toHaveLength(1);
		expect(body.data[0].blockNumber).toBe(MOCK_BLOCK_OFFSET_100);
	});

	it('respects limit and offset for pagination', async () => {
		const events = Array.from({ length: 5 }, (_, i) =>
			makeEvent({ blockNumber: MOCK_BASE_BLOCK + i, logIndex: i }),
		);
		await FeeEventModel.insertMany(events);

		const app = await buildServer();
		const response = await app.inject({
			method: 'GET',
			url: '/events?integrator=0xe165726007b58dab2893f85e206f20388fa2f8ce&limit=2&offset=1',
		});

		const body = response.json();
		expect(body.data).toHaveLength(2);
		expect(body.pagination.total).toBe(5);
		expect(body.pagination.limit).toBe(2);
		expect(body.pagination.offset).toBe(1);
	});

	it('returns empty array when no events match', async () => {
		const app = await buildServer();
		const response = await app.inject({
			method: 'GET',
			url: '/events?integrator=0x0000000000000000000000000000000000000000',
		});

		const body = response.json();
		expect(body.data).toHaveLength(0);
		expect(body.pagination.total).toBe(0);
	});

	it('matches integrator case-insensitively', async () => {
		await FeeEventModel.insertMany([makeEvent({ logIndex: 0 })]);

		const app = await buildServer();
		const response = await app.inject({
			method: 'GET',
			url: '/events?integrator=0xE165726007b58Dab2893F85e206f20388FA2f8CE',
		});

		expect(response.statusCode).toBe(200);
		const body = response.json();
		expect(body.data).toHaveLength(1);
	});

	it('matches token filter case-insensitively', async () => {
		await FeeEventModel.insertMany([
			makeEvent({
				logIndex: 0,
				token: '0x2791bca1f2de4661ed88a30c99a7a9449aa84174',
			}),
		]);

		const app = await buildServer();
		const response = await app.inject({
			method: 'GET',
			url: '/events?integrator=0xe165726007b58dab2893f85e206f20388fa2f8ce&token=0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
		});

		expect(response.statusCode).toBe(200);
		const body = response.json();
		expect(body.data).toHaveLength(1);
	});

	it('returns nextCursor when there are more results', async () => {
		const events = Array.from({ length: 3 }, (_, i) =>
			makeEvent({ blockNumber: MOCK_BASE_BLOCK + i, logIndex: i }),
		);
		await FeeEventModel.insertMany(events);

		const app = await buildServer();
		const response = await app.inject({
			method: 'GET',
			url: '/events?integrator=0xe165726007b58dab2893f85e206f20388fa2f8ce&limit=2',
		});

		const body = response.json();
		expect(body.data).toHaveLength(2);
		expect(body.pagination.nextCursor).toBeDefined();
		expect(typeof body.pagination.nextCursor).toBe('string');
	});

	it('returns remaining results when using cursor', async () => {
		const events = Array.from({ length: 3 }, (_, i) =>
			makeEvent({ blockNumber: MOCK_BASE_BLOCK + i, logIndex: i }),
		);
		await FeeEventModel.insertMany(events);

		const app = await buildServer();

		const first = await app.inject({
			method: 'GET',
			url: '/events?integrator=0xe165726007b58dab2893f85e206f20388fa2f8ce&limit=2',
		});
		const firstBody = first.json();
		expect(firstBody.data).toHaveLength(2);

		const second = await app.inject({
			method: 'GET',
			url: `/events?integrator=0xe165726007b58dab2893f85e206f20388fa2f8ce&limit=2&cursor=${firstBody.pagination.nextCursor}`,
		});
		const secondBody = second.json();
		expect(secondBody.data).toHaveLength(1);
		expect(secondBody.pagination.nextCursor).toBeUndefined();
	});

	it('does not return nextCursor when all results fit in one page', async () => {
		await FeeEventModel.insertMany([makeEvent({ logIndex: 0 })]);

		const app = await buildServer();
		const response = await app.inject({
			method: 'GET',
			url: '/events?integrator=0xe165726007b58dab2893f85e206f20388fa2f8ce&limit=10',
		});

		const body = response.json();
		expect(body.data).toHaveLength(1);
		expect(body.pagination.nextCursor).toBeUndefined();
	});
});

describe('GET /health (integration)', () => {
	it('returns ok status with chain sync states', async () => {
		await SyncStateModel.create({
			chainId: 'polygon',
			lastSyncedBlock: MOCK_HEALTH_BLOCK,
		});

		const app = await buildServer();
		const response = await app.inject({
			method: 'GET',
			url: '/health',
		});

		expect(response.statusCode).toBe(200);
		const body = response.json();
		expect(body.status).toBe('ok');
		expect(body.database).toBe('connected');
		expect(body.chains).toHaveLength(1);
		expect(body.chains[0].chainId).toBe('polygon');
		expect(body.chains[0].lastSyncedBlock).toBe(MOCK_HEALTH_BLOCK);
	});
});
