import type pino from 'pino';

type CleanupFn = () => Promise<void>;

const FORCE_KILL_TIMEOUT_MS = 15_000;
const FORCE_KILL_EXIT_CODE = 1;

let isShuttingDown = false;
let initialized = false;
const cleanupFns: CleanupFn[] = [];
let logger: pino.Logger | undefined;

export function initShutdownHandler(log: pino.Logger): void {
	logger = log;
	if (initialized) return;
	initialized = true;
	process.once('SIGTERM', () => runShutdown('SIGTERM'));
	process.once('SIGINT', () => runShutdown('SIGINT'));
}

export function registerShutdownHandler(fn: CleanupFn): void {
	cleanupFns.push(fn);
}

export function isShutdownRequested(): boolean {
	return isShuttingDown;
}

async function runShutdown(signal: string): Promise<void> {
	if (isShuttingDown) return;
	isShuttingDown = true;

	logger?.info({ signal }, 'Graceful shutdown initiated');

	const forceKillTimer = setTimeout(() => {
		logger?.error('Shutdown timed out — forcing exit');
		process.exit(FORCE_KILL_EXIT_CODE);
	}, FORCE_KILL_TIMEOUT_MS);
	forceKillTimer.unref();

	for (let i = cleanupFns.length - 1; i >= 0; i--) {
		try {
			await cleanupFns[i]();
		} catch (err) {
			logger?.error({ err }, 'Error during shutdown cleanup');
		}
	}

	clearTimeout(forceKillTimer);
	logger?.info('Cleanup handlers complete — returning control to caller');
}
