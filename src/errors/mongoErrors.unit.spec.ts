import { describe, expect, it } from 'vitest';
import { isBulkDuplicatesOnly } from './mongoErrors.js';

describe('isBulkDuplicatesOnly', () => {
  it('returns true when all writeErrors have direct code 11000', () => {
    const err = {
      writeErrors: [{ code: 11000 }, { code: 11000 }],
    };
    expect(isBulkDuplicatesOnly(err)).toBe(true);
  });

  it('returns true when all writeErrors use nested err.code 11000 (MongoDB driver v6+)', () => {
    const err = {
      writeErrors: [{ err: { code: 11000 } }, { err: { code: 11000 } }],
    };
    expect(isBulkDuplicatesOnly(err)).toBe(true);
  });

  it('returns true with mixed shapes (direct + nested) all 11000', () => {
    const err = {
      writeErrors: [{ code: 11000 }, { err: { code: 11000 } }],
    };
    expect(isBulkDuplicatesOnly(err)).toBe(true);
  });

  it('returns false when any writeError has a non-11000 code', () => {
    const err = {
      writeErrors: [{ code: 11000 }, { code: 50 }],
    };
    expect(isBulkDuplicatesOnly(err)).toBe(false);
  });

  it('returns false for null', () => {
    expect(isBulkDuplicatesOnly(null)).toBe(false);
  });

  it('returns false for non-object', () => {
    expect(isBulkDuplicatesOnly('error string')).toBe(false);
  });

  it('returns false when writeErrors property is missing', () => {
    expect(isBulkDuplicatesOnly({ message: 'fail' })).toBe(false);
  });

  it('returns false for empty writeErrors array', () => {
    expect(isBulkDuplicatesOnly({ writeErrors: [] })).toBe(false);
  });

  it('returns false when writeErrors is not an array', () => {
    expect(isBulkDuplicatesOnly({ writeErrors: 'not-array' })).toBe(false);
  });

  it('returns false when nested err.code is not 11000', () => {
    const err = {
      writeErrors: [{ err: { code: 50 } }],
    };
    expect(isBulkDuplicatesOnly(err)).toBe(false);
  });
});
