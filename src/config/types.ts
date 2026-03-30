/** Chain configuration for scanner instantiation */
export interface ChainConfig {
  /** Unique chain identifier, e.g. "polygon" or "stellar-testnet" */
  chainId: string;
  /** Human-readable name */
  name: string;
  /** RPC endpoint URL */
  rpcUrl: string;
  /** Contract address (EVM) or contract ID (Stellar) */
  contractAddress: string;
  /** First block/ledger to scan */
  startBlock: number;
  /** How many blocks/ledgers to scan per batch */
  batchSize: number;
  /** Safety margin — blocks/ledgers behind head */
  confirmations: number;
  /** Chain type for scanner selection */
  type: 'evm' | 'stellar';
}

/** Normalized event stored in MongoDB */
export interface NormalizedEvent {
  chainId: string;
  blockNumber: number;
  transactionHash: string;
  logIndex: number;
  token: string;
  integrator: string;
  integratorFee: string;
  lifiFee: string;
  timestamp: Date;
}
