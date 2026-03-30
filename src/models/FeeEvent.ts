import {
  getModelForClass,
  index,
  modelOptions,
  prop,
} from '@typegoose/typegoose';

@modelOptions({
  schemaOptions: {
    collection: 'fee_events',
    timestamps: false,
    versionKey: false,
  },
})
@index({ integrator: 1 })
@index({ chainId: 1, blockNumber: 1 })
@index({ token: 1 })
@index({ chainId: 1, transactionHash: 1, logIndex: 1 }, { unique: true })
@index({ integrator: 1, blockNumber: -1, transactionHash: 1, logIndex: 1 })
export class FeeEvent {
  @prop({ required: true })
  public chainId: string = '';

  @prop({ required: true })
  public blockNumber: number = 0;

  @prop({ required: true })
  public transactionHash: string = '';

  @prop({ required: true })
  public logIndex: number = 0;

  @prop({ required: true })
  public token: string = '';

  @prop({ required: true })
  public integrator: string = '';

  @prop({ required: true })
  public integratorFee: string = '';

  @prop({ required: true })
  public lifiFee: string = '';

  @prop({ required: true })
  public timestamp: Date = new Date(0);
}

export const FeeEventModel = getModelForClass(FeeEvent);
