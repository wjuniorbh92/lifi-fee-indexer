import type { FastifyReply, FastifyRequest } from 'fastify';
import { ApiErrorCode, sendError } from '../helpers/errorResponse.js';

const NOT_FOUND_STRIKE_LIMIT = 5;
const BAN_DURATION_MS = 600_000; // 10 minutes
const STRIKE_WINDOW_MS = 60_000; // 1 minute window for counting strikes
const CLEANUP_INTERVAL_MS = 300_000; // clean stale entries every 5 minutes

interface StrikeRecord {
  count: number;
  firstStrike: number;
  bannedUntil: number;
}

export function createBotBanHook() {
  const strikes = new Map<string, StrikeRecord>();

  const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [ip, record] of strikes) {
      if (
        record.bannedUntil < now &&
        now - record.firstStrike > STRIKE_WINDOW_MS
      ) {
        strikes.delete(ip);
      }
    }
  }, CLEANUP_INTERVAL_MS);
  cleanupTimer.unref();

  function getClientIp(request: FastifyRequest): string {
    return request.ip;
  }

  function onRequest(
    request: FastifyRequest,
    reply: FastifyReply,
    done: () => void,
  ) {
    const ip = getClientIp(request);
    const record = strikes.get(ip);

    if (record && record.bannedUntil > Date.now()) {
      sendError(reply, 403, 'Forbidden', ApiErrorCode.FORBIDDEN);
      return;
    }

    done();
  }

  function notFoundHandler(request: FastifyRequest, reply: FastifyReply) {
    const ip = getClientIp(request);
    const now = Date.now();
    const record = strikes.get(ip);

    if (record) {
      if (now - record.firstStrike > STRIKE_WINDOW_MS) {
        record.count = 1;
        record.firstStrike = now;
      } else {
        record.count++;
      }

      if (record.count >= NOT_FOUND_STRIKE_LIMIT) {
        record.bannedUntil = now + BAN_DURATION_MS;
        request.log.warn(
          { ip, strikes: record.count },
          'IP banned for repeated 404 hits',
        );
        return sendError(reply, 403, 'Forbidden', ApiErrorCode.FORBIDDEN);
      }
    } else {
      strikes.set(ip, {
        count: 1,
        firstStrike: now,
        bannedUntil: 0,
      });
    }

    return sendError(
      reply,
      404,
      `Route ${request.method}:${request.url} not found`,
      ApiErrorCode.NOT_FOUND,
    );
  }

  function destroy() {
    clearInterval(cleanupTimer);
  }

  return { onRequest, notFoundHandler, destroy };
}
