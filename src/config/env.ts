import { z } from 'zod';

export const DEFAULT_POLL_INTERVAL_MS = 10_000;

const envSchema = z.object({
  MONGODB_URI: z.string().min(1),
  POLYGON_RPC_URL: z.string().url(),
  STELLAR_HORIZON_URL: z
    .string()
    .url()
    .default('https://soroban-testnet.stellar.org'),
  FEE_COLLECTOR_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  STELLAR_INTEGRATOR_ADDRESS: z.string().default(''),
  BATCH_SIZE: z.coerce.number().int().min(1).max(10_000).default(2000),
  EVM_START_BLOCK: z.coerce.number().int().min(0).default(78_600_000),
  POLL_INTERVAL_MS: z.coerce
    .number()
    .int()
    .min(1000)
    .default(DEFAULT_POLL_INTERVAL_MS),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace'])
    .default('info'),
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
