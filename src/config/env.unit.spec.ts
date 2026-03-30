import { afterEach, describe, expect, it, vi } from 'vitest';

const TEST_MONGODB_URI = 'mongodb://localhost:27017/test';
const TEST_POLYGON_RPC = 'https://polygon-rpc.com';
const TEST_FEE_COLLECTOR = '0xbD6C7B0d2f68c2b7805d88388319cfB6EcB50eA9';
const EXPECTED_BATCH_SIZE = 2000;
const EXPECTED_EVM_START_BLOCK = 78_600_000;
const EXPECTED_POLL_INTERVAL = 10_000;
const EXPECTED_PORT = 3000;
const EXPECTED_HOST = '0.0.0.0';
const EXPECTED_LOG_LEVEL = 'info';
const EXPECTED_STELLAR_HORIZON = 'https://soroban-testnet.stellar.org';
const CUSTOM_BATCH_SIZE = 500;
const CUSTOM_PORT = 8080;

describe('loadEnv', () => {
  const validEnv = {
    MONGODB_URI: TEST_MONGODB_URI,
    POLYGON_RPC_URL: TEST_POLYGON_RPC,
    FEE_COLLECTOR_ADDRESS: TEST_FEE_COLLECTOR,
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
    expect(env.BATCH_SIZE).toBe(EXPECTED_BATCH_SIZE);
    expect(env.EVM_START_BLOCK).toBe(EXPECTED_EVM_START_BLOCK);
    expect(env.POLL_INTERVAL_MS).toBe(EXPECTED_POLL_INTERVAL);
    expect(env.PORT).toBe(EXPECTED_PORT);
    expect(env.HOST).toBe(EXPECTED_HOST);
    expect(env.LOG_LEVEL).toBe(EXPECTED_LOG_LEVEL);
    expect(env.STELLAR_HORIZON_URL).toBe(EXPECTED_STELLAR_HORIZON);
  });

  it('coerces numeric string values', async () => {
    vi.stubEnv('MONGODB_URI', validEnv.MONGODB_URI);
    vi.stubEnv('POLYGON_RPC_URL', validEnv.POLYGON_RPC_URL);
    vi.stubEnv('FEE_COLLECTOR_ADDRESS', validEnv.FEE_COLLECTOR_ADDRESS);
    vi.stubEnv('BATCH_SIZE', String(CUSTOM_BATCH_SIZE));
    vi.stubEnv('PORT', String(CUSTOM_PORT));

    const { loadEnv } = await import('./env.js');
    const env = loadEnv();

    expect(env.BATCH_SIZE).toBe(CUSTOM_BATCH_SIZE);
    expect(env.PORT).toBe(CUSTOM_PORT);
  });

  it('exits on missing required env vars', async () => {
    vi.stubEnv('MONGODB_URI', '');
    vi.stubEnv('POLYGON_RPC_URL', '');
    vi.stubEnv('FEE_COLLECTOR_ADDRESS', '');

    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation(() => undefined as never);
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

    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation(() => undefined as never);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { loadEnv } = await import('./env.js');
    loadEnv();

    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
