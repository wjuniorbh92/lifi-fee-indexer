import { sleep } from './sleep.js';

interface RetryOptions {
	maxRetries?: number;
	baseDelayMs?: number;
	maxDelayMs?: number;
	retryOn?: (err: unknown) => boolean;
}

export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
	const { maxRetries = 3, baseDelayMs = 1000, maxDelayMs = 30000, retryOn } = options;

	let lastError: unknown;

	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		try {
			return await fn();
		} catch (err) {
			lastError = err;

			if (attempt === maxRetries) break;
			if (retryOn && !retryOn(err)) break;

			const baseDelay = Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);
			const jitter = Math.random() * baseDelay * 0.1;
			const delay = Math.floor(baseDelay + jitter);

			await sleep(delay);
		}
	}

	throw lastError;
}
