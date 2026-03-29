import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBotBanHook } from './botBan.js';

const MOCK_IP = '192.168.1.1';
const MOCK_IP_2 = '10.0.0.1';
const NOT_FOUND_STRIKE_LIMIT = 5;
const BAN_DURATION_MS = 600_000;

function createMockRequest(ip = MOCK_IP, method = 'GET', url = '/unknown') {
	return {
		ip,
		method,
		url,
		log: { warn: vi.fn() },
	} as unknown as Parameters<ReturnType<typeof createBotBanHook>['onRequest']>[0];
}

function createMockReply() {
	const reply = {
		status: vi.fn().mockReturnThis(),
		send: vi.fn().mockReturnThis(),
	} as unknown as Parameters<ReturnType<typeof createBotBanHook>['onRequest']>[1];
	return reply;
}

describe('botBan middleware', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe('onRequest', () => {
		it('calls done() for non-banned IPs', () => {
			const { onRequest } = createBotBanHook();
			const done = vi.fn();

			onRequest(createMockRequest(), createMockReply(), done);

			expect(done).toHaveBeenCalledOnce();
		});

		it('sends 403 and calls done() for banned IPs', () => {
			const { onRequest, notFoundHandler } = createBotBanHook();
			const request = createMockRequest();

			for (let i = 0; i < NOT_FOUND_STRIKE_LIMIT; i++) {
				notFoundHandler(request, createMockReply());
			}

			const reply = createMockReply();
			const done = vi.fn();
			onRequest(request, reply, done);

			expect(reply.status).toHaveBeenCalledWith(403);
			expect(reply.send).toHaveBeenCalledWith({
				error: 'Forbidden',
				code: 'FORBIDDEN',
			});
			expect(done).toHaveBeenCalledOnce();
		});

		it('allows request after ban expires', () => {
			const { onRequest, notFoundHandler } = createBotBanHook();
			const request = createMockRequest();

			for (let i = 0; i < NOT_FOUND_STRIKE_LIMIT; i++) {
				notFoundHandler(request, createMockReply());
			}

			vi.advanceTimersByTime(BAN_DURATION_MS + 1);

			const done = vi.fn();
			onRequest(request, createMockReply(), done);

			expect(done).toHaveBeenCalledOnce();
		});
	});

	describe('notFoundHandler', () => {
		it('returns 404 for first strike', () => {
			const { notFoundHandler } = createBotBanHook();
			const reply = createMockReply();

			notFoundHandler(createMockRequest(), reply);

			expect(reply.status).toHaveBeenCalledWith(404);
		});

		it('bans IP after reaching strike limit', () => {
			const { notFoundHandler } = createBotBanHook();
			const request = createMockRequest();

			for (let i = 0; i < NOT_FOUND_STRIKE_LIMIT - 1; i++) {
				notFoundHandler(request, createMockReply());
			}

			const reply = createMockReply();
			notFoundHandler(request, reply);

			expect(reply.status).toHaveBeenCalledWith(403);
		});

		it('resets strike count after window expires', () => {
			const { notFoundHandler } = createBotBanHook();
			const request = createMockRequest();

			for (let i = 0; i < NOT_FOUND_STRIKE_LIMIT - 1; i++) {
				notFoundHandler(request, createMockReply());
			}

			vi.advanceTimersByTime(61_000);

			const reply = createMockReply();
			notFoundHandler(request, reply);

			expect(reply.status).toHaveBeenCalledWith(404);
		});

		it('tracks strikes per IP independently', () => {
			const { notFoundHandler } = createBotBanHook();

			for (let i = 0; i < NOT_FOUND_STRIKE_LIMIT - 1; i++) {
				notFoundHandler(createMockRequest(MOCK_IP), createMockReply());
			}

			const reply = createMockReply();
			notFoundHandler(createMockRequest(MOCK_IP_2), reply);

			expect(reply.status).toHaveBeenCalledWith(404);
		});
	});

	describe('destroy', () => {
		it('clears the cleanup interval', () => {
			const { destroy } = createBotBanHook();
			const timersBefore = vi.getTimerCount();

			destroy();

			expect(vi.getTimerCount()).toBeLessThan(timersBefore);
		});
	});
});
