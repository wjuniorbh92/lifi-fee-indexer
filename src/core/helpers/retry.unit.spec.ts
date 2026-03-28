import { beforeEach, describe, expect, it, vi } from 'vitest';
import { withRetry } from './retry.js';

const mockSleep = vi.hoisted(() => vi.fn());

vi.mock('./sleep.js', () => ({
	sleep: mockSleep,
}));

describe('withRetry', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockSleep.mockResolvedValue(undefined);
	});

	it('returns result on first success without retrying', async () => {
		const fn = vi.fn().mockResolvedValue('ok');

		const result = await withRetry(fn);

		expect(result).toBe('ok');
		expect(fn).toHaveBeenCalledTimes(1);
		expect(mockSleep).not.toHaveBeenCalled();
	});

	it('retries up to maxRetries times then throws', async () => {
		const error = new Error('fail');
		const fn = vi.fn().mockRejectedValue(error);

		await expect(withRetry(fn, { maxRetries: 2 })).rejects.toThrow('fail');

		expect(fn).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
		expect(mockSleep).toHaveBeenCalledTimes(2);
	});

	it('succeeds on retry after initial failures', async () => {
		const fn = vi
			.fn()
			.mockRejectedValueOnce(new Error('fail-1'))
			.mockRejectedValueOnce(new Error('fail-2'))
			.mockResolvedValueOnce('recovered');

		const result = await withRetry(fn, { maxRetries: 3 });

		expect(result).toBe('recovered');
		expect(fn).toHaveBeenCalledTimes(3);
		expect(mockSleep).toHaveBeenCalledTimes(2);
	});

	it('stops retrying when retryOn returns false', async () => {
		const nonRetryableError = new Error('fatal');
		const fn = vi.fn().mockRejectedValue(nonRetryableError);

		await expect(
			withRetry(fn, {
				maxRetries: 5,
				retryOn: (err) => (err as Error).message !== 'fatal',
			}),
		).rejects.toThrow('fatal');

		expect(fn).toHaveBeenCalledTimes(1);
		expect(mockSleep).not.toHaveBeenCalled();
	});

	it('caps delay at maxDelayMs', async () => {
		const fn = vi
			.fn()
			.mockRejectedValueOnce(new Error('fail'))
			.mockRejectedValueOnce(new Error('fail'))
			.mockRejectedValueOnce(new Error('fail'))
			.mockResolvedValueOnce('ok');

		vi.spyOn(Math, 'random').mockReturnValue(0);

		await withRetry(fn, {
			maxRetries: 3,
			baseDelayMs: 10_000,
			maxDelayMs: 15_000,
		});

		for (const call of mockSleep.mock.calls) {
			expect(call[0]).toBeLessThanOrEqual(15_000);
		}

		vi.spyOn(Math, 'random').mockRestore();
	});

	it('clamps negative maxRetries to 0 and executes fn once', async () => {
		const error = new Error('fail');
		const fn = vi.fn().mockRejectedValue(error);

		await expect(withRetry(fn, { maxRetries: -1 })).rejects.toThrow('fail');

		expect(fn).toHaveBeenCalledTimes(1);
		expect(mockSleep).not.toHaveBeenCalled();
	});
});
