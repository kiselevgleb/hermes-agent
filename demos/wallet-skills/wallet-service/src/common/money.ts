const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

export function asBigint(value: bigint | number | string): bigint {
  return typeof value === 'bigint' ? value : BigInt(value);
}

/** JSON numbers stay inside the safe integer range. Amounts are cents. */
export function money(value: bigint): number {
  if (value > MAX_SAFE || value < -MAX_SAFE) {
    throw new Error('amount is outside the safe integer range');
  }
  return Number(value);
}
