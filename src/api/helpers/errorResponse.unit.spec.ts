import { describe, expect, it, vi } from 'vitest';
import { ApiErrorCode, sendError } from './errorResponse.js';

function createMockReply() {
  const reply = {
    status: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
  };
  return reply;
}

describe('sendError', () => {
  it('sends error with code and message', () => {
    const reply = createMockReply();
    sendError(
      reply as never,
      400,
      'Invalid input',
      ApiErrorCode.VALIDATION_ERROR,
    );

    expect(reply.status).toHaveBeenCalledWith(400);
    expect(reply.send).toHaveBeenCalledWith({
      error: 'Invalid input',
      code: 'VALIDATION_ERROR',
    });
  });

  it('includes details when provided', () => {
    const reply = createMockReply();
    sendError(
      reply as never,
      502,
      'RPC failed',
      ApiErrorCode.RPC_FETCH_FAILED,
      { retries: 3 },
    );

    expect(reply.send).toHaveBeenCalledWith({
      error: 'RPC failed',
      code: 'RPC_FETCH_FAILED',
      details: { retries: 3 },
    });
  });

  it('omits details when undefined', () => {
    const reply = createMockReply();
    sendError(reply as never, 404, 'Not found', ApiErrorCode.NOT_FOUND);

    const sent = reply.send.mock.calls[0][0];
    expect(sent).not.toHaveProperty('details');
  });
});
