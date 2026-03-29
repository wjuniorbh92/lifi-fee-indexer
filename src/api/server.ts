import rateLimit from '@fastify/rate-limit';
import fastify from 'fastify';
import type pino from 'pino';
import { createBotBanHook } from './middleware/botBan.js';
import { eventsRoute } from './routes/events.js';
import { healthRoute } from './routes/health.js';

const RATE_LIMIT_MAX = 100;
const RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_BODY_SIZE = 1_048_576; // 1 MB

export async function buildServer(logger?: pino.Logger) {
	const app = fastify({
		logger: logger
			? {
					level: logger.level,
					transport: logger.level === 'debug' ? { target: 'pino-pretty' } : undefined,
				}
			: false,
		trustProxy: true,
		bodyLimit: MAX_BODY_SIZE,
	});

	const botBan = createBotBanHook();
	app.addHook('onRequest', botBan.onRequest);
	app.setNotFoundHandler(botBan.notFoundHandler);

	await app.register(rateLimit, {
		max: RATE_LIMIT_MAX,
		timeWindow: RATE_LIMIT_WINDOW_MS,
	});

	await app.register(eventsRoute);
	await app.register(healthRoute);

	return app;
}
