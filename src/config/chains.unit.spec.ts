import { describe, expect, it } from 'vitest';
import { buildChainConfigs } from './chains.js';
import type { Env } from './env.js';

const baseEnv: Env = {
	MONGODB_URI: 'mongodb://localhost:27017/test',
	POLYGON_RPC_URL: 'https://polygon-rpc.com',
	STELLAR_HORIZON_URL: 'https://horizon-testnet.stellar.org',
	FEE_COLLECTOR_ADDRESS: '0xbD6C7B0d2f68c2b7805d88388319cfB6EcB50eA9',
	STELLAR_INTEGRATOR_ADDRESS: '',
	BATCH_SIZE: 2000,
	EVM_START_BLOCK: 78_600_000,
	POLL_INTERVAL_MS: 10_000,
	PORT: 3000,
	HOST: '0.0.0.0',
	LOG_LEVEL: 'info',
};

describe('buildChainConfigs', () => {
	it('returns only Polygon when STELLAR_INTEGRATOR_ADDRESS is empty', () => {
		const chains = buildChainConfigs(baseEnv);

		expect(chains).toHaveLength(1);
		expect(chains[0].chainId).toBe('polygon');
		expect(chains[0].type).toBe('evm');
		expect(chains[0].rpcUrl).toBe(baseEnv.POLYGON_RPC_URL);
		expect(chains[0].contractAddress).toBe(baseEnv.FEE_COLLECTOR_ADDRESS);
		expect(chains[0].startBlock).toBe(78_600_000);
		expect(chains[0].batchSize).toBe(2000);
		expect(chains[0].confirmations).toBe(64);
	});

	it('includes Stellar when STELLAR_INTEGRATOR_ADDRESS is set', () => {
		const env = { ...baseEnv, STELLAR_INTEGRATOR_ADDRESS: 'GABCDEFG' };
		const chains = buildChainConfigs(env);

		expect(chains).toHaveLength(2);
		expect(chains[1].chainId).toBe('stellar-testnet');
		expect(chains[1].type).toBe('stellar');
		expect(chains[1].contractAddress).toBe('GABCDEFG');
		expect(chains[1].confirmations).toBe(0);
	});

	it('uses env values for configurable fields', () => {
		const env = { ...baseEnv, BATCH_SIZE: 500, EVM_START_BLOCK: 90_000_000 };
		const chains = buildChainConfigs(env);

		expect(chains[0].batchSize).toBe(500);
		expect(chains[0].startBlock).toBe(90_000_000);
	});
});
