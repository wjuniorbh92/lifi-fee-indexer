const MONGO_DUPLICATE_KEY_CODE = 11000;

/**
 * Checks whether a MongoDB bulk write error consists exclusively
 * of duplicate key violations (code 11000).
 *
 * Handles both MongoDB driver v5 shape (`we.code`) and
 * v6+ shape (`we.err.code`).
 */
export function isBulkDuplicatesOnly(err: unknown): boolean {
  if (err === null || typeof err !== 'object' || !('writeErrors' in err)) {
    return false;
  }

  const { writeErrors } = err as { writeErrors: unknown };
  if (!Array.isArray(writeErrors) || writeErrors.length === 0) {
    return false;
  }

  return (
    writeErrors as Array<{ code?: number; err?: { code: number } }>
  ).every(
    (we) =>
      we.code === MONGO_DUPLICATE_KEY_CODE ||
      we.err?.code === MONGO_DUPLICATE_KEY_CODE,
  );
}
