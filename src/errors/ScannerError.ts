import type { ErrorCode } from './ErrorCode.js';

export class ScannerError extends Error {
  public readonly code: ErrorCode;
  public readonly chainId?: string;
  public readonly retryable: boolean;

  constructor(options: {
    message: string;
    code: ErrorCode;
    chainId?: string;
    retryable?: boolean;
    cause?: unknown;
  }) {
    super(options.message, { cause: options.cause });
    this.name = 'ScannerError';
    this.code = options.code;
    this.chainId = options.chainId;
    this.retryable = options.retryable ?? false;
  }
}
