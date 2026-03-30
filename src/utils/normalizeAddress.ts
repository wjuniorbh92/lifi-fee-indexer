import { StrKey } from '@stellar/stellar-sdk';

/**
 * Normalize a blockchain address for consistent storage and querying.
 * Stellar addresses (G.../C...) are stored uppercase.
 * EVM addresses (0x...) are stored lowercase.
 */
export function normalizeAddress(address: string): string {
  if (
    StrKey.isValidEd25519PublicKey(address) ||
    StrKey.isValidContract(address)
  ) {
    return address.toUpperCase();
  }
  return address.toLowerCase();
}
