import { afterEach, describe, expect, it, vi } from 'vitest';

describe('loadEnv', () => {
	const validEnv = {
		MONGODB_URI: 'mongodb://localhost:27017/test',
		POLYGON_RPC_URL: 'https://polygon-rpc.com',
		FEE_COLLECTOR_ADDRESS: '0xbD6C7B0d2f68c2b7805d88388319cfB6EcB50eA9',
	};

	afterEach(() => {
		vi.unstubAllEnvs();
		vi.resetModules();
	});

	it('parses valid env with defaults', async () => {
		vi.stubEnv('MONGODB_URI', validEnv.MONGODB_URI);
		vi.stubEnv('POLYGON_RPC_URL', validEnv.POLYGON_RPC_URL);
		vi.stubEnv('FEE_COLLECTOR_ADDRESS', validEnv.FEE_COLLECTOR_ADDRESS);

		const { loadEnv } = await import('./env.js');
		const env = loadEnv();

		expect(env.MONGODB_URI).toBe(validEnv.MONGODB_URI);
		expect(env.POLYGON_RPC_URL).toBe(validEnv.POLYGON_RPC_URL);
		expect(env.BATCH_SIZE).toBe(2000);
		expect(env.EVM_START_BLOCK).toBe(78_600_000);
		expect(env.POLL_INTERVAL_MS).toBe(10_000);
		expect(env.PORT).toBe(3000);
		expect(env.HOST).toBe('0.0.0.0');
		expect(env.LOG_LEVEL).toBe('info');
		expect(env.STELLAR_HORIZON_URL).toBe('https://horizon-testnet.stellar.org');
	});

	it('coerces numeric string values', async () => {
		vi.stubEnv('MONGODB_URI', validEnv.MONGODB_URI);
		vi.stubEnv('POLYGON_RPC_URL', validEnv.POLYGON_RPC_URL);
		vi.stubEnv('FEE_COLLECTOR_ADDRESS', validEnv.FEE_COLLECTOR_ADDRESS);
		vi.stubEnv('BATCH_SIZE', '500');
		vi.stubEnv('PORT', '8080');

		const { loadEnv } = await import('./env.js');
		const env = loadEnv();

		expect(env.BATCH_SIZE).toBe(500);
		expect(env.PORT).toBe(8080);
	});

	it('exits on missing required env vars', async () => {
		vi.stubEnv('MONGODB_URI', '');
		vi.stubEnv('POLYGON_RPC_URL', '');
		vi.stubEnv('FEE_COLLECTOR_ADDRESS', '');

		const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

		const { loadEnv } = await import('./env.js');
		loadEnv();

		expect(exitSpy).toHaveBeenCalledWith(1);
		exitSpy.mockRestore();
		errorSpy.mockRestore();
	});

	it('rejects invalid FEE_COLLECTOR_ADDRESS format', async () => {
		vi.stubEnv('MONGODB_URI', validEnv.MONGODB_URI);
		vi.stubEnv('POLYGON_RPC_URL', validEnv.POLYGON_RPC_URL);
		vi.stubEnv('FEE_COLLECTOR_ADDRESS', 'not-an-address');

		const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

		const { loadEnv } = await import('./env.js');
		loadEnv();

		expect(exitSpy).toHaveBeenCalledWith(1);
		exitSpy.mockRestore();
		errorSpy.mockRestore();
	});
});
