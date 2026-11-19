import { ApplyInput, LedgerError, StoredTx, applyOperation } from './ledger';

function tx(partial: Partial<StoredTx> & Pick<StoredTx, 'id' | 'externalId' | 'type' | 'amount'>): StoredTx {
  return {
    id: partial.id,
    externalId: partial.externalId,
    type: partial.type,
    amount: partial.amount,
    balanceAfter: partial.balanceAfter ?? partial.amount,
    referenceExternalId: partial.referenceExternalId ?? null,
  };
}

function input(overrides: Partial<ApplyInput> = {}): ApplyInput {
  return {
    balance: 0n,
    existing: null,
    type: 'deposit',
    externalId: 'ext-1',
    amount: 100n,
    newId: 'new-id',
    bet: null,
    original: null,
    alreadyRolledBack: false,
    recentBets: 0n,
    hourlyBetLimit: 1_000_000n,
    ...overrides,
  };
}

function codes(run: () => void): LedgerError {
  try {
    run();
  } catch (error) {
    if (error instanceof LedgerError) return error;
    throw error;
  }
  throw new Error('expected LedgerError');
}

describe('applyOperation', () => {
  it('deposits and records the balance after the operation', () => {
    const result = applyOperation(input({ balance: 40n, amount: 10n }));
    expect(result.idempotent).toBe(false);
    expect(result.balance).toBe(50n);
    expect(result.tx).toMatchObject({ type: 'deposit', amount: 10n, balanceAfter: 50n, referenceExternalId: null });
  });

  it('returns the stored result when the external id was already used', () => {
    const existing = tx({
      id: 'original',
      externalId: 'ext-1',
      type: 'deposit',
      amount: 100n,
      balanceAfter: 100n,
    });
    const result = applyOperation(input({ balance: 5n, amount: 999n, existing }));
    expect(result.idempotent).toBe(true);
    expect(result.balance).toBe(100n);
    expect(result.tx.id).toBe('original');
  });

  it('rejects a non-positive amount', () => {
    expect(codes(() => applyOperation(input({ amount: 0n }))).code).toBe('INVALID_AMOUNT');
  });

  it('rejects a deposit that would overflow bigint', () => {
    expect(codes(() => applyOperation(input({ balance: 9223372036854775807n, amount: 1n }))).code).toBe(
      'INVALID_AMOUNT',
    );
  });

  it('places a bet when the balance covers it', () => {
    const result = applyOperation(input({ type: 'bet', balance: 80n, amount: 30n }));
    expect(result.balance).toBe(50n);
    expect(result.tx.type).toBe('bet');
  });

  it('rejects a bet that would make the balance negative', () => {
    expect(codes(() => applyOperation(input({ type: 'bet', balance: 20n, amount: 30n }))).code).toBe(
      'INSUFFICIENT_FUNDS',
    );
  });

  it('rejects a bet over the hourly limit before touching the balance', () => {
    expect(
      codes(() => applyOperation(input({ type: 'bet', balance: 500n, amount: 30n, recentBets: 80n, hourlyBetLimit: 100n })))
        .code,
    ).toBe('HOURLY_LIMIT');
  });

  it('credits a win that points at a bet, even when the win is larger than the bet', () => {
    const bet = tx({ id: 'b', externalId: 'bet-1', type: 'bet', amount: 10n, balanceAfter: 0n });
    const result = applyOperation(input({ type: 'win', balance: 0n, amount: 40n, bet }));
    expect(result.balance).toBe(40n);
    expect(result.tx.referenceExternalId).toBe('bet-1');
  });

  it('rejects a win that does not point at a bet', () => {
    const deposit = tx({ id: 'd', externalId: 'dep-1', type: 'deposit', amount: 10n, balanceAfter: 10n });
    expect(codes(() => applyOperation(input({ type: 'win', bet: null }))).code).toBe('BET_NOT_FOUND');
    expect(codes(() => applyOperation(input({ type: 'win', bet: deposit }))).code).toBe('BET_NOT_FOUND');
  });

  it('does not credit a repeated win', () => {
    const existing = tx({
      id: 'win-1',
      externalId: 'win-ext',
      type: 'win',
      amount: 40n,
      balanceAfter: 40n,
      referenceExternalId: 'bet-1',
    });
    const result = applyOperation(input({ type: 'win', balance: 40n, amount: 40n, existing, bet: null }));
    expect(result.idempotent).toBe(true);
    expect(result.balance).toBe(40n);
    expect(result.tx.id).toBe('win-1');
  });

  it('refunds a bet on rollback', () => {
    const original = tx({ id: 'b', externalId: 'bet-1', type: 'bet', amount: 30n, balanceAfter: 50n });
    const result = applyOperation(input({ type: 'rollback', balance: 50n, amount: 0n, original }));
    expect(result.balance).toBe(80n);
    expect(result.tx).toMatchObject({ type: 'rollback', amount: 30n, referenceExternalId: 'bet-1' });
  });

  it('debits a deposit or a win on rollback', () => {
    const deposit = tx({ id: 'd', externalId: 'dep-1', type: 'deposit', amount: 40n, balanceAfter: 40n });
    const win = tx({ id: 'w', externalId: 'win-1', type: 'win', amount: 25n, balanceAfter: 25n });
    expect(applyOperation(input({ type: 'rollback', balance: 100n, original: deposit })).balance).toBe(60n);
    expect(applyOperation(input({ type: 'rollback', balance: 25n, original: win })).balance).toBe(0n);
  });

  it('rejects a rollback that would make the balance negative', () => {
    const win = tx({ id: 'w', externalId: 'win-1', type: 'win', amount: 80n, balanceAfter: 80n });
    expect(codes(() => applyOperation(input({ type: 'rollback', balance: 10n, original: win }))).code).toBe(
      'INSUFFICIENT_FUNDS',
    );
  });

  it('rejects a missing original, a rollback of a rollback, and a second rollback', () => {
    const rollback = tx({ id: 'r', externalId: 'rb', type: 'rollback', amount: 10n, balanceAfter: 10n });
    expect(codes(() => applyOperation(input({ type: 'rollback', original: null }))).code).toBe('ORIGINAL_NOT_FOUND');
    expect(codes(() => applyOperation(input({ type: 'rollback', original: rollback }))).code).toBe('INVALID_ROLLBACK');
    const bet = tx({ id: 'b', externalId: 'bet-1', type: 'bet', amount: 10n, balanceAfter: 0n });
    expect(
      codes(() => applyOperation(input({ type: 'rollback', balance: 0n, original: bet, alreadyRolledBack: true }))).code,
    ).toBe('ALREADY_ROLLED_BACK');
  });
});
