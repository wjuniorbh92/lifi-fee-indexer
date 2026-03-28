export const ErrorCode = {
	RPC_TIMEOUT: 'RPC_TIMEOUT',
	RPC_RATE_LIMITED: 'RPC_RATE_LIMITED',
	RPC_BLOCK_RANGE: 'RPC_BLOCK_RANGE',
	RPC_SERVER_ERROR: 'RPC_SERVER_ERROR',
	DB_CONNECTION: 'DB_CONNECTION',
	DB_WRITE_TIMEOUT: 'DB_WRITE_TIMEOUT',
	DECODE_ERROR: 'DECODE_ERROR',
	CONFIG_INVALID: 'CONFIG_INVALID',
	STELLAR_RETENTION: 'STELLAR_RETENTION',
	STELLAR_INVALID_CURSOR: 'STELLAR_INVALID_CURSOR',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export class ScannerError extends Error {
	public readonly code: ErrorCode;
	public readonly chainId?: string;
	public readonly retryable: boolean;
	public override readonly cause?: unknown;

	constructor(options: {
		message: string;
		code: ErrorCode;
		chainId?: string;
		retryable?: boolean;
		cause?: unknown;
	}) {
		super(options.message);
		this.name = 'ScannerError';
		this.code = options.code;
		this.chainId = options.chainId;
		this.retryable = options.retryable ?? false;
		this.cause = options.cause;
	}
}
