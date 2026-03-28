import mongoose from 'mongoose';
import type pino from 'pino';

export async function connectDatabase(uri: string, logger: pino.Logger): Promise<void> {
	await mongoose.connect(uri);
	logger.info('MongoDB connected');
}

export async function disconnectDatabase(logger: pino.Logger): Promise<void> {
	await mongoose.disconnect();
	logger.info('MongoDB disconnected');
}
