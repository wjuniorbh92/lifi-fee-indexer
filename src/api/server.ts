import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import fastify from 'fastify';
import type pino from 'pino';
import { DEFAULT_POLL_INTERVAL_MS } from '../config/env.js';
import type { ChainScanner } from '../scanners/types.js';
import { metrics } from '../utils/metrics.js';
import { normalizeAddress } from '../utils/normalizeAddress.js';
import { createBotBanHook } from './middleware/botBan.js';
import { eventsRoute } from './routes/events.js';
import { fetchEventsRoute } from './routes/fetchEvents.js';
import { healthRoute } from './routes/health.js';

const RATE_LIMIT_MAX = 100;
const RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_BODY_SIZE = 1_048_576; // 1 MB

export interface BuildServerOptions {
  logger?: pino.Logger;
  scanners?: Map<string, ChainScanner>;
  pollIntervalMs?: number;
}

export async function buildServer(options: BuildServerOptions = {}) {
  const { logger, scanners, pollIntervalMs } = options;
  const app = fastify({
    logger: logger
      ? {
          level: logger.level,
          transport:
            logger.level === 'debug' ? { target: 'pino-pretty' } : undefined,
        }
      : false,
    trustProxy: true,
    bodyLimit: MAX_BODY_SIZE,
  });

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'LI.FI Fee Indexer API',
        description:
          'FeeCollector event indexer for Polygon (EVM) and Stellar Testnet',
        version: '1.0.0',
      },
    },
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });

  const botBan = createBotBanHook();
  app.addHook('onRequest', botBan.onRequest);
  app.setNotFoundHandler(botBan.notFoundHandler);
  app.addHook('onClose', () => botBan.destroy());

  await app.register(rateLimit, {
    max: RATE_LIMIT_MAX,
    timeWindow: RATE_LIMIT_WINDOW_MS,
    keyGenerator: (request) => {
      if (request.url.startsWith('/events')) {
        const url = new URL(request.url, 'http://localhost');
        const integrator = url.searchParams.get('integrator');
        if (integrator) return `integrator:${normalizeAddress(integrator)}`;
      }
      return request.ip;
    },
  });

  await app.register(eventsRoute);
  await app.register(healthRoute, {
    pollIntervalMs: pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS,
  });

  app.get('/metrics', async (_request, reply) => {
    return reply.type('text/plain; charset=utf-8').send(metrics.serialize());
  });

  app.addHook('onResponse', (request, reply, done) => {
    const route = request.routeOptions?.url ?? request.url;
    metrics.increment('api_requests_total', {
      route,
      method: request.method,
      status: String(reply.statusCode),
    });
    done();
  });

  if (scanners) {
    await app.register(fetchEventsRoute, { scanners });
  }

  return app;
}
