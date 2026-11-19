export type TxType = 'deposit' | 'bet' | 'win' | 'rollback';

export type LedgerCode =
  | 'INSUFFICIENT_FUNDS'
  | 'BET_NOT_FOUND'
  | 'ORIGINAL_NOT_FOUND'
  | 'INVALID_ROLLBACK'
  | 'ALREADY_ROLLED_BACK'
  | 'INVALID_AMOUNT'
  | 'HOURLY_LIMIT';

const MAX_INT8 = 9223372036854775807n;

export class LedgerError extends Error {
  constructor(
    readonly code: LedgerCode,
    message: string,
  ) {
    super(message);
    this.name = 'LedgerError';
  }
}

export interface StoredTx {
  id: string;
  externalId: string;
  type: TxType;
  amount: bigint;
  balanceAfter: bigint;
  referenceExternalId: string | null;
}

export interface ApplyInput {
  balance: bigint;
  existing: StoredTx | null;
  type: TxType;
  externalId: string;
  amount: bigint;
  newId: string;
  bet: StoredTx | null;
  original: StoredTx | null;
  alreadyRolledBack: boolean;
  recentBets: bigint;
  hourlyBetLimit: bigint;
}

export interface ApplyResult {
  balance: bigint;
  tx: StoredTx;
  idempotent: boolean;
}

/**
 * Pure ledger step. The caller holds the wallet row lock and loads `existing`
 * by (wallet, externalId). A repeat returns the stored result and does not
 * move the balance.
 */
export function applyOperation(input: ApplyInput): ApplyResult {
  if (input.existing) {
    return { balance: input.existing.balanceAfter, tx: input.existing, idempotent: true };
  }

  if (input.type !== 'rollback' && input.amount <= 0n) {
    throw new LedgerError('INVALID_AMOUNT', 'amount must be positive');
  }

  let next = input.balance;
  let storedAmount = input.amount;
  let referenceExternalId: string | null = null;

  switch (input.type) {
    case 'deposit':
      next = input.balance + input.amount;
      break;
    case 'bet':
      if (input.recentBets + input.amount > input.hourlyBetLimit) {
        throw new LedgerError('HOURLY_LIMIT', 'hourly bet limit exceeded');
      }
      if (input.balance < input.amount) {
        throw new LedgerError('INSUFFICIENT_FUNDS', 'insufficient funds');
      }
      next = input.balance - input.amount;
      break;
    case 'win':
      if (!input.bet || input.bet.type !== 'bet') {
        throw new LedgerError('BET_NOT_FOUND', 'bet not found');
      }
      next = input.balance + input.amount;
      referenceExternalId = input.bet.externalId;
      break;
    case 'rollback': {
      const original = input.original;
      if (!original) {
        throw new LedgerError('ORIGINAL_NOT_FOUND', 'original transaction not found');
      }
      if (original.type === 'rollback') {
        throw new LedgerError('INVALID_ROLLBACK', 'cannot roll back a rollback');
      }
      if (input.alreadyRolledBack) {
        throw new LedgerError('ALREADY_ROLLED_BACK', 'transaction already rolled back');
      }
      storedAmount = original.amount;
      referenceExternalId = original.externalId;
      next = original.type === 'bet' ? input.balance + original.amount : input.balance - original.amount;
      break;
    }
    default: {
      const neverType: never = input.type;
      throw new LedgerError('INVALID_AMOUNT', `unsupported type ${String(neverType)}`);
    }
  }

  if (next < 0n) {
    throw new LedgerError('INSUFFICIENT_FUNDS', 'insufficient funds');
  }
  if (next > MAX_INT8) {
    throw new LedgerError('INVALID_AMOUNT', 'amount overflows');
  }

  return {
    balance: next,
    idempotent: false,
    tx: {
      id: input.newId,
      externalId: input.externalId,
      type: input.type,
      amount: storedAmount,
      referenceExternalId,
      balanceAfter: next,
    },
  };
}
