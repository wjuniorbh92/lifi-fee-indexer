import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { FeeEventModel } from './FeeEvent.js';

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
});

function makeEvent(overrides: Partial<Record<string, unknown>> = {}) {
	return {
		chainId: 'polygon',
		blockNumber: 78600100,
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

describe('FeeEvent integration', () => {
	it('inserts and retrieves a fee event', async () => {
		await FeeEventModel.create(makeEvent());

		const found = await FeeEventModel.findOne({ chainId: 'polygon' }).lean();
		expect(found).toMatchObject({
			chainId: 'polygon',
			blockNumber: 78600100,
			integratorFee: '1000000',
		});
	});

	it('deduplicates on (chainId, transactionHash, logIndex)', async () => {
		const event = makeEvent();
		await FeeEventModel.insertMany([event], { ordered: false });

		try {
			await FeeEventModel.insertMany([event], { ordered: false });
		} catch {
			// expected E11000
		}

		const count = await FeeEventModel.countDocuments();
		expect(count).toBe(1);
	});

	it('allows same txHash with different logIndex', async () => {
		await FeeEventModel.insertMany([makeEvent({ logIndex: 0 }), makeEvent({ logIndex: 1 })]);

		const count = await FeeEventModel.countDocuments();
		expect(count).toBe(2);
	});

	it('allows same txHash+logIndex on different chains', async () => {
		await FeeEventModel.insertMany([
			makeEvent({ chainId: 'polygon' }),
			makeEvent({ chainId: 'stellar-testnet' }),
		]);

		const count = await FeeEventModel.countDocuments();
		expect(count).toBe(2);
	});

	it('queries by integrator', async () => {
		await FeeEventModel.insertMany([
			makeEvent({ integrator: '0xAAA', logIndex: 0 }),
			makeEvent({ integrator: '0xBBB', logIndex: 1 }),
			makeEvent({ integrator: '0xAAA', logIndex: 2 }),
		]);

		const results = await FeeEventModel.find({ integrator: '0xAAA' }).lean();
		expect(results).toHaveLength(2);
	});
});
