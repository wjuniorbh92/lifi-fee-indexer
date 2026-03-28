import { sleep } from './sleep.js';

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_BASE_DELAY_MS = 1000;
const DEFAULT_MAX_DELAY_MS = 30_000;
const JITTER_FACTOR = 0.1;

interface RetryOptions {
	maxRetries?: number;
	baseDelayMs?: number;
	maxDelayMs?: number;
	retryOn?: (err: unknown) => boolean;
}

export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
	const {
		maxRetries: rawMaxRetries = DEFAULT_MAX_RETRIES,
		baseDelayMs = DEFAULT_BASE_DELAY_MS,
		maxDelayMs = DEFAULT_MAX_DELAY_MS,
		retryOn,
	} = options;

	const maxRetries = Math.max(0, rawMaxRetries);
	let lastError: unknown;

	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		try {
			return await fn();
		} catch (err) {
			lastError = err;

			if (attempt === maxRetries) break;
			if (retryOn && !retryOn(err)) break;

			const baseDelay = Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);
			const jitter = Math.random() * baseDelay * JITTER_FACTOR;
			const delay = Math.floor(baseDelay + jitter);

			await sleep(delay);
		}
	}

	throw lastError;
}
