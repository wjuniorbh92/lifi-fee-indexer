import rateLimit from '@fastify/rate-limit';
import fastify from 'fastify';
import { eventsRoute } from './routes/events.js';
import { healthRoute } from './routes/health.js';

const RATE_LIMIT_MAX = 100;
const RATE_LIMIT_WINDOW_MS = 60_000;

export async function buildServer() {
	const app = fastify({ logger: false });

	await app.register(rateLimit, {
		max: RATE_LIMIT_MAX,
		timeWindow: RATE_LIMIT_WINDOW_MS,
	});

	app.register(eventsRoute);
	app.register(healthRoute);

	return app;
}
