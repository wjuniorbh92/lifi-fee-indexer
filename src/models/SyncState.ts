import { getModelForClass, index, modelOptions, prop } from '@typegoose/typegoose';

@modelOptions({
	schemaOptions: {
		collection: 'sync_states',
		timestamps: false,
		versionKey: false,
	},
})
@index({ chainId: 1 }, { unique: true })
export class SyncState {
	@prop({ required: true })
	public chainId!: string;

	@prop({ required: true })
	public lastSyncedBlock!: number;

	@prop()
	public lastCursor?: string;

	@prop({ required: true })
	public updatedAt!: Date;
}

export const SyncStateModel = getModelForClass(SyncState);
