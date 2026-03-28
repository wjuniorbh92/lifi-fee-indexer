import { getModelForClass, index, prop } from '@typegoose/typegoose';

@index({ integrator: 1 })
@index({ chainId: 1, blockNumber: 1 })
@index({ token: 1 })
@index({ transactionHash: 1, logIndex: 1 }, { unique: true })
export class FeeEvent {
	@prop({ required: true })
	public chainId!: string;

	@prop({ required: true })
	public blockNumber!: number;

	@prop({ required: true })
	public transactionHash!: string;

	@prop({ required: true })
	public logIndex!: number;

	@prop({ required: true })
	public token!: string;

	@prop({ required: true })
	public integrator!: string;

	@prop({ required: true })
	public integratorFee!: string;

	@prop({ required: true })
	public lifiFee!: string;

	@prop({ required: true })
	public timestamp!: Date;
}

export const FeeEventModel = getModelForClass(FeeEvent, {
	schemaOptions: { collection: 'fee_events' },
});
