import type pino from 'pino';

type CleanupFn = () => Promise<void>;

let isShuttingDown = false;
const cleanupFns: CleanupFn[] = [];
let logger: pino.Logger | undefined;

export function initShutdownHandler(log: pino.Logger): void {
	logger = log;
	process.on('SIGTERM', () => runShutdown('SIGTERM'));
	process.on('SIGINT', () => runShutdown('SIGINT'));
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

	for (let i = cleanupFns.length - 1; i >= 0; i--) {
		try {
			await cleanupFns[i]();
		} catch (err) {
			logger?.error({ err }, 'Error during shutdown cleanup');
		}
	}

	logger?.info('Cleanup handlers complete — waiting for scanners to drain');
}
