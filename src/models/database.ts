import mongoose from 'mongoose';
import type pino from 'pino';

const SERVER_SELECTION_TIMEOUT_MS = 5000;
const SOCKET_TIMEOUT_MS = 45_000;

let listenersRegistered = false;
let intentionalDisconnect = false;

export async function connectDatabase(
  uri: string,
  logger: pino.Logger,
): Promise<void> {
  intentionalDisconnect = false;
  if (!listenersRegistered) {
    mongoose.connection.on('error', (err) => {
      logger.error({ err }, 'MongoDB connection error');
    });

    mongoose.connection.on('disconnected', () => {
      if (!intentionalDisconnect) {
        logger.warn('MongoDB disconnected');
      }
    });

    listenersRegistered = true;
  }

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: SERVER_SELECTION_TIMEOUT_MS,
    socketTimeoutMS: SOCKET_TIMEOUT_MS,
  });

  logger.info('MongoDB connected');
}

export async function disconnectDatabase(logger: pino.Logger): Promise<void> {
  intentionalDisconnect = true;
  await mongoose.disconnect();
  logger.info('MongoDB disconnected');
}

export function isDatabaseConnected(): boolean {
  return mongoose.connection.readyState === 1;
}
