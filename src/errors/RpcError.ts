import { type ErrorCode, ScannerError } from './ScannerError.js';

export class RpcError extends ScannerError {
	public readonly statusCode?: number;

	constructor(options: {
		message: string;
		code: ErrorCode;
		statusCode?: number;
		chainId?: string;
		retryable?: boolean;
		cause?: unknown;
	}) {
		super(options);
		this.name = 'RpcError';
		this.statusCode = options.statusCode;
	}
}

export function isRetryableRpcError(err: unknown): boolean {
	if (err instanceof RpcError) {
		if (err.retryable) return true;
	}

	if (err instanceof Error) {
		const msg = err.message.toLowerCase();
		if (msg.includes('etimedout')) return true;
		if (msg.includes('econnreset')) return true;
		if (msg.includes('econnrefused')) return true;
		if (msg.includes('rate limit') || msg.includes('429')) return true;
		if (msg.includes('block range')) return true;
		if (msg.includes('502') || msg.includes('503') || msg.includes('504')) return true;
		if (msg.includes('fetch failed') || msg.includes('socket hang up')) return true;
	}
	return false;
}
