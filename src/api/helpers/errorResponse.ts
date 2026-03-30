import type { FastifyReply } from 'fastify';

export const ApiErrorCode = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNKNOWN_CHAIN: 'UNKNOWN_CHAIN',
  BLOCK_RANGE_INVALID: 'BLOCK_RANGE_INVALID',
  BLOCK_RANGE_TOO_LARGE: 'BLOCK_RANGE_TOO_LARGE',
  RPC_FETCH_FAILED: 'RPC_FETCH_FAILED',
  DB_WRITE_FAILED: 'DB_WRITE_FAILED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
} as const;

export type ApiErrorCode = (typeof ApiErrorCode)[keyof typeof ApiErrorCode];

export interface ErrorResponseBody {
  error: string;
  code: ApiErrorCode;
  details?: unknown;
}

export function sendError(
  reply: FastifyReply,
  statusCode: number,
  error: string,
  code: ApiErrorCode,
  details?: unknown,
): FastifyReply {
  const body: ErrorResponseBody = { error, code };
  if (details !== undefined) {
    body.details = details;
  }
  return reply.status(statusCode).send(body);
}
