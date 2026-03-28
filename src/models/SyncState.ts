import { getModelForClass, index, prop } from '@typegoose/typegoose';

@index({ chainId: 1 }, { unique: true })
export class SyncState {
	@prop({ required: true, unique: true })
	public chainId!: string;

	@prop({ required: true })
	public lastSyncedBlock!: number;

	@prop()
	public lastCursor?: string;

	@prop({ required: true, default: () => new Date() })
	public updatedAt!: Date;
}

export const SyncStateModel = getModelForClass(SyncState, {
	schemaOptions: { collection: 'sync_states' },
});
