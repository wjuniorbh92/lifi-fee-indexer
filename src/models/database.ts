import mongoose from 'mongoose';
import type pino from 'pino';

let listenersRegistered = false;

export async function connectDatabase(uri: string, logger: pino.Logger): Promise<void> {
	if (!listenersRegistered) {
		mongoose.connection.on('error', (err) => {
			logger.error({ err }, 'MongoDB connection error');
		});

		mongoose.connection.on('disconnected', () => {
			logger.warn('MongoDB disconnected');
		});

		listenersRegistered = true;
	}

	await mongoose.connect(uri, {
		serverSelectionTimeoutMS: 5000,
		socketTimeoutMS: 45000,
	});

	logger.info('MongoDB connected');
}

export async function disconnectDatabase(logger: pino.Logger): Promise<void> {
	await mongoose.disconnect();
	logger.info('MongoDB disconnected');
}

export function isDatabaseConnected(): boolean {
	return mongoose.connection.readyState === 1;
}
