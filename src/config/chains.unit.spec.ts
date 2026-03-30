import { describe, expect, it } from 'vitest';
import { buildChainConfigs } from './chains.js';
import type { Env } from './env.js';

const TEST_MONGODB_URI = 'mongodb://localhost:27017/test';
const TEST_POLYGON_RPC = 'https://polygon-rpc.com';
const TEST_STELLAR_HORIZON = 'https://horizon-testnet.stellar.org';
const TEST_FEE_COLLECTOR = '0xbD6C7B0d2f68c2b7805d88388319cfB6EcB50eA9';
const DEFAULT_BATCH_SIZE = 2000;
const DEFAULT_EVM_START_BLOCK = 78_600_000;
const DEFAULT_POLL_INTERVAL = 10_000;
const DEFAULT_PORT = 3000;
const DEFAULT_HOST = '0.0.0.0';
const DEFAULT_LOG_LEVEL = 'info';
const EVM_CONFIRMATIONS = 64;
const STELLAR_CONFIRMATIONS = 0;
const CUSTOM_BATCH_SIZE = 500;
const CUSTOM_EVM_START_BLOCK = 90_000_000;

const baseEnv: Env = {
  MONGODB_URI: TEST_MONGODB_URI,
  POLYGON_RPC_URL: TEST_POLYGON_RPC,
  STELLAR_HORIZON_URL: TEST_STELLAR_HORIZON,
  FEE_COLLECTOR_ADDRESS: TEST_FEE_COLLECTOR,
  STELLAR_INTEGRATOR_ADDRESS: '',
  BATCH_SIZE: DEFAULT_BATCH_SIZE,
  EVM_START_BLOCK: DEFAULT_EVM_START_BLOCK,
  POLL_INTERVAL_MS: DEFAULT_POLL_INTERVAL,
  PORT: DEFAULT_PORT,
  HOST: DEFAULT_HOST,
  LOG_LEVEL: DEFAULT_LOG_LEVEL,
};

describe('buildChainConfigs', () => {
  it('returns only Polygon when STELLAR_INTEGRATOR_ADDRESS is empty', () => {
    const chains = buildChainConfigs(baseEnv);

    expect(chains).toHaveLength(1);
    expect(chains[0].chainId).toBe('polygon');
    expect(chains[0].type).toBe('evm');
    expect(chains[0].rpcUrl).toBe(baseEnv.POLYGON_RPC_URL);
    expect(chains[0].contractAddress).toBe(baseEnv.FEE_COLLECTOR_ADDRESS);
    expect(chains[0].startBlock).toBe(DEFAULT_EVM_START_BLOCK);
    expect(chains[0].batchSize).toBe(DEFAULT_BATCH_SIZE);
    expect(chains[0].confirmations).toBe(EVM_CONFIRMATIONS);
  });

  it('includes Stellar when STELLAR_INTEGRATOR_ADDRESS is set', () => {
    const env = { ...baseEnv, STELLAR_INTEGRATOR_ADDRESS: 'GABCDEFG' };
    const chains = buildChainConfigs(env);

    expect(chains).toHaveLength(2);
    expect(chains[1].chainId).toBe('stellar-testnet');
    expect(chains[1].type).toBe('stellar');
    expect(chains[1].contractAddress).toBe('GABCDEFG');
    expect(chains[1].confirmations).toBe(STELLAR_CONFIRMATIONS);
  });

  it('uses env values for configurable fields', () => {
    const env = {
      ...baseEnv,
      BATCH_SIZE: CUSTOM_BATCH_SIZE,
      EVM_START_BLOCK: CUSTOM_EVM_START_BLOCK,
    };
    const chains = buildChainConfigs(env);

    expect(chains[0].batchSize).toBe(CUSTOM_BATCH_SIZE);
    expect(chains[0].startBlock).toBe(CUSTOM_EVM_START_BLOCK);
  });
});
