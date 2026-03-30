import { parseAbiItem } from 'viem';

export const feesCollectedEvent = parseAbiItem(
  'event FeesCollected(address indexed _token, address indexed _integrator, uint256 _integratorFee, uint256 _lifiFee)',
);
