import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockLogger = {
	info: vi.fn(),
	error: vi.fn(),
	warn: vi.fn(),
	debug: vi.fn(),
	child: vi.fn().mockReturnThis(),
	level: 'info',
};

describe('gracefulShutdown', () => {
	let initShutdownHandler: typeof import('./gracefulShutdown.js')['initShutdownHandler'];
	let registerShutdownHandler: typeof import('./gracefulShutdown.js')['registerShutdownHandler'];
	let isShutdownRequested: typeof import('./gracefulShutdown.js')['isShutdownRequested'];

	beforeEach(async () => {
		vi.useFakeTimers();
		vi.resetModules();
		vi.restoreAllMocks();
		const mod = await import('./gracefulShutdown.js');
		initShutdownHandler = mod.initShutdownHandler;
		registerShutdownHandler = mod.registerShutdownHandler;
		isShutdownRequested = mod.isShutdownRequested;
	});

	afterEach(() => {
		vi.useRealTimers();
		process.removeAllListeners('SIGTERM');
		process.removeAllListeners('SIGINT');
	});

	it('isShutdownRequested returns false initially', () => {
		expect(isShutdownRequested()).toBe(false);
	});

	it('sets shutdown flag when SIGTERM is emitted', async () => {
		initShutdownHandler(mockLogger as never);

		process.emit('SIGTERM');
		await vi.runAllTimersAsync();

		expect(isShutdownRequested()).toBe(true);
	});

	it('sets shutdown flag when SIGINT is emitted', async () => {
		initShutdownHandler(mockLogger as never);

		process.emit('SIGINT');
		await vi.runAllTimersAsync();

		expect(isShutdownRequested()).toBe(true);
	});

	it('runs cleanup handlers in LIFO order', async () => {
		initShutdownHandler(mockLogger as never);
		const callOrder: number[] = [];

		registerShutdownHandler(async () => {
			callOrder.push(1);
		});
		registerShutdownHandler(async () => {
			callOrder.push(2);
		});
		registerShutdownHandler(async () => {
			callOrder.push(3);
		});

		process.emit('SIGTERM');
		await vi.runAllTimersAsync();

		expect(callOrder).toEqual([3, 2, 1]);
	});

	it('catches errors in cleanup handlers without aborting remaining handlers', async () => {
		initShutdownHandler(mockLogger as never);
		const callOrder: number[] = [];

		registerShutdownHandler(async () => {
			callOrder.push(1);
		});
		registerShutdownHandler(async () => {
			throw new Error('cleanup failed');
		});
		registerShutdownHandler(async () => {
			callOrder.push(3);
		});

		process.emit('SIGTERM');
		await vi.runAllTimersAsync();

		expect(callOrder).toEqual([3, 1]);
		expect(mockLogger.error).toHaveBeenCalled();
	});

	it('does not run cleanup twice on second signal', async () => {
		initShutdownHandler(mockLogger as never);
		let callCount = 0;

		registerShutdownHandler(async () => {
			callCount++;
		});

		process.emit('SIGTERM');
		await vi.runAllTimersAsync();

		// SIGTERM was registered with process.once, so it won't fire again.
		// Emit SIGINT (the other registered signal) to exercise the
		// isShuttingDown re-entry guard in runShutdown.
		process.emit('SIGINT');
		await vi.runAllTimersAsync();

		expect(callCount).toBe(1);
		expect(isShutdownRequested()).toBe(true);
	});
});
