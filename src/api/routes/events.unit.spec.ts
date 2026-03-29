import { describe, expect, it, vi } from 'vitest';

const EXPECTED_DEFAULT_LIMIT = 100;
const EXPECTED_MAX_LIMIT = 1000;
const MOCK_BLOCK_NUMBER = 78600100;

const { mockFind, mockCountDocuments } = vi.hoisted(() => {
	const mockLean = vi.fn();
	const mockLimit = vi.fn().mockReturnValue({ lean: mockLean });
	const mockSkip = vi.fn().mockReturnValue({ limit: mockLimit });
	const mockSort = vi.fn().mockReturnValue({ skip: mockSkip });
	const mockFind = vi.fn().mockReturnValue({ sort: mockSort });
	const mockCountDocuments = vi.fn();
	return { mockFind, mockCountDocuments, mockSort, mockSkip, mockLimit, mockLean };
});

vi.mock('../../models/FeeEvent.js', () => ({
	FeeEventModel: {
		find: mockFind,
		countDocuments: mockCountDocuments,
	},
}));

vi.mock('../../models/SyncState.js', () => ({
	SyncStateModel: {
		find: vi.fn().mockReturnValue({ lean: vi.fn().mockResolvedValue([]) }),
	},
}));

vi.mock('../../models/database.js', () => ({
	isDatabaseConnected: vi.fn().mockReturnValue(true),
}));

const MOCK_EVENT = {
	chainId: 'polygon',
	blockNumber: MOCK_BLOCK_NUMBER,
	transactionHash: '0xabc',
	logIndex: 0,
	token: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
	integrator: '0xe165726007b58dab2893f85e206f20388fa2f8ce',
	integratorFee: '1000000',
	lifiFee: '50000',
	timestamp: '2026-01-01T00:00:00.000Z',
};

async function buildApp() {
	const { buildServer } = await import('../server.js');
	return buildServer();
}

describe('GET /events', () => {
	it('returns events for a valid integrator query', async () => {
		// Reset chain for this test
		mockFind.mockReturnValueOnce({
			sort: vi.fn().mockReturnValue({
				skip: vi.fn().mockReturnValue({
					limit: vi.fn().mockReturnValue({
						lean: vi.fn().mockResolvedValue([MOCK_EVENT]),
					}),
				}),
			}),
		});
		mockCountDocuments.mockResolvedValueOnce(1);

		const app = await buildApp();
		const response = await app.inject({
			method: 'GET',
			url: '/events?integrator=0xe165726007b58dab2893f85e206f20388fa2f8ce',
		});

		expect(response.statusCode).toBe(200);
		const body = response.json();
		expect(body.data).toEqual([MOCK_EVENT]);
		expect(body.pagination).toEqual({ total: 1, limit: EXPECTED_DEFAULT_LIMIT, offset: 0 });
	});

	it('returns 400 when integrator is missing', async () => {
		const app = await buildApp();
		const response = await app.inject({
			method: 'GET',
			url: '/events',
		});

		expect(response.statusCode).toBe(400);
	});

	it('applies limit and offset from query params', async () => {
		mockFind.mockReturnValueOnce({
			sort: vi.fn().mockReturnValue({
				skip: vi.fn().mockReturnValue({
					limit: vi.fn().mockReturnValue({
						lean: vi.fn().mockResolvedValue([]),
					}),
				}),
			}),
		});
		mockCountDocuments.mockResolvedValueOnce(0);

		const app = await buildApp();
		const response = await app.inject({
			method: 'GET',
			url: '/events?integrator=0xabc&limit=50&offset=10',
		});

		expect(response.statusCode).toBe(200);
		const body = response.json();
		expect(body.pagination).toEqual({ total: 0, limit: 50, offset: 10 });
	});

	it('clamps limit to MAX_LIMIT (1000)', async () => {
		mockFind.mockReturnValueOnce({
			sort: vi.fn().mockReturnValue({
				skip: vi.fn().mockReturnValue({
					limit: vi.fn().mockReturnValue({
						lean: vi.fn().mockResolvedValue([]),
					}),
				}),
			}),
		});
		mockCountDocuments.mockResolvedValueOnce(0);

		const app = await buildApp();
		const response = await app.inject({
			method: 'GET',
			url: '/events?integrator=0xabc&limit=5000',
		});

		const body = response.json();
		expect(body.pagination.limit).toBe(EXPECTED_MAX_LIMIT);
	});

	it('rejects non-numeric fromBlock', async () => {
		const app = await buildApp();
		const response = await app.inject({
			method: 'GET',
			url: '/events?integrator=0xabc&fromBlock=notanumber',
		});

		expect(response.statusCode).toBe(400);
	});
});
