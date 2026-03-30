import { z } from 'zod';

export const DEFAULT_POLL_INTERVAL_MS = 10_000;
const DEFAULT_STELLAR_HORIZON_URL = 'https://soroban-testnet.stellar.org';
const DEFAULT_BATCH_SIZE = 2000;
const MAX_BATCH_SIZE = 10_000;
const DEFAULT_EVM_START_BLOCK = 78_600_000;
const MIN_POLL_INTERVAL_MS = 1000;
const DEFAULT_PORT = 3000;
const MAX_PORT = 65535;
const DEFAULT_HOST = '0.0.0.0';
const DEFAULT_LOG_LEVEL = 'info' as const;

const envSchema = z.object({
  MONGODB_URI: z.string().min(1),
  POLYGON_RPC_URL: z.string().url(),
  STELLAR_HORIZON_URL: z.string().url().default(DEFAULT_STELLAR_HORIZON_URL),
  FEE_COLLECTOR_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  STELLAR_INTEGRATOR_ADDRESS: z.string().default(''),
  BATCH_SIZE: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_BATCH_SIZE)
    .default(DEFAULT_BATCH_SIZE),
  EVM_START_BLOCK: z.coerce
    .number()
    .int()
    .min(0)
    .default(DEFAULT_EVM_START_BLOCK),
  POLL_INTERVAL_MS: z.coerce
    .number()
    .int()
    .min(MIN_POLL_INTERVAL_MS)
    .default(DEFAULT_POLL_INTERVAL_MS),
  PORT: z.coerce.number().int().min(1).max(MAX_PORT).default(DEFAULT_PORT),
  HOST: z.string().default(DEFAULT_HOST),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default(DEFAULT_LOG_LEVEL),
});

export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | undefined;

export function loadEnv(): Env {
  if (cachedEnv) return cachedEnv;
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('Invalid environment variables:');
    for (const issue of result.error.issues) {
      console.error(`  ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
  }
  cachedEnv = result.data;
  return cachedEnv;
}
