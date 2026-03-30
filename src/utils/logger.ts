import pino from 'pino';

const DEFAULT_LOG_LEVEL = 'info';
const PRODUCTION_ENV = 'production';
const PRETTY_TRANSPORT = 'pino-pretty';

export function createLogger(level = DEFAULT_LOG_LEVEL): pino.Logger {
  return pino({
    level,
    transport:
      process.env.NODE_ENV !== PRODUCTION_ENV
        ? { target: PRETTY_TRANSPORT, options: { colorize: true } }
        : undefined,
  });
}
