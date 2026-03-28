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
		if (msg.includes('rate limit') || msg.includes('too many requests') || /\b429\b/.test(msg))
			return true;
		if (
			msg.includes('bad gateway') ||
			msg.includes('service unavailable') ||
			msg.includes('gateway timeout') ||
			/\b50[234]\b/.test(msg)
		)
			return true;
		if (msg.includes('fetch failed') || msg.includes('socket hang up')) return true;
	}
	return false;
}

export function isBlockRangeRpcError(err: unknown): boolean {
	if (err instanceof RpcError && err.code === 'RPC_BLOCK_RANGE') return true;

	if (err instanceof Error) {
		const msg = err.message.toLowerCase();
		if (msg.includes('block range')) return true;
		if (msg.includes('block span')) return true;
		if (msg.includes('too many blocks')) return true;
		if (msg.includes('exceed') && msg.includes('range')) return true;
	}

	return false;
}
