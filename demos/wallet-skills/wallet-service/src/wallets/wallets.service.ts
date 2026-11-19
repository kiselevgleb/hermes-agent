import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { money } from '../common/money';
import { LedgerError, TxType, applyOperation } from './ledger';
import { LedgerGateway } from './ledger.gateway';

export const HOURLY_BET_LIMIT = Symbol('HOURLY_BET_LIMIT');

export interface MoneyResult {
  id: string;
  walletId: string;
  externalId: string;
  type: TxType;
  amount: number;
  balanceAfter: number;
  idempotentReplay: boolean;
}

@Injectable()
export class WalletsService {
  constructor(
    private readonly ledger: LedgerGateway,
    @Inject(HOURLY_BET_LIMIT) private readonly hourlyBetLimit: bigint,
  ) {}

  deposit(walletId: string, externalId: string, amount: number): Promise<MoneyResult> {
    return this.apply(walletId, { type: 'deposit', externalId, amount: this.cents(amount) });
  }

  bet(walletId: string, externalId: string, amount: number): Promise<MoneyResult> {
    return this.apply(walletId, { type: 'bet', externalId, amount: this.cents(amount) });
  }

  win(walletId: string, externalId: string, amount: number, betExternalId: string): Promise<MoneyResult> {
    return this.apply(walletId, { type: 'win', externalId, amount: this.cents(amount), betExternalId });
  }

  rollback(walletId: string, externalId: string, originalExternalId: string): Promise<MoneyResult> {
    return this.apply(walletId, { type: 'rollback', externalId, amount: 0n, originalExternalId });
  }

  private async apply(
    walletId: string,
    input: {
      type: TxType;
      externalId: string;
      amount: bigint;
      betExternalId?: string;
      originalExternalId?: string;
    },
  ): Promise<MoneyResult> {
    try {
      return await this.ledger.run(walletId, async (lock) => {
        if (!lock.wallet) {
          throw new NotFoundException('wallet not found');
        }

        const existing = await lock.findTx(input.externalId);
        const bet = !existing && input.type === 'win' ? await lock.findTx(input.betExternalId ?? '') : null;
        const original =
          !existing && input.type === 'rollback' ? await lock.findTx(input.originalExternalId ?? '') : null;
        const alreadyRolledBack =
          !existing && input.type === 'rollback' && input.originalExternalId
            ? (await lock.findRollback(input.originalExternalId)) !== null
            : false;
        const recentBets = !existing && input.type === 'bet' ? await lock.recentBetSum() : 0n;

        const result = applyOperation({
          balance: lock.wallet.balance,
          existing,
          type: input.type,
          externalId: input.externalId,
          amount: input.amount,
          newId: randomUUID(),
          bet,
          original,
          alreadyRolledBack,
          recentBets,
          hourlyBetLimit: this.hourlyBetLimit,
        });

        if (!result.idempotent) {
          await lock.commitNew(result.tx, result.balance);
        }

        return {
          id: result.tx.id,
          walletId,
          externalId: result.tx.externalId,
          type: result.tx.type,
          amount: money(result.tx.amount),
          balanceAfter: money(result.balance),
          idempotentReplay: result.idempotent,
        };
      });
    } catch (error) {
      if (error instanceof LedgerError) {
        throw this.toHttp(error);
      }
      throw error;
    }
  }

  private cents(value: number): bigint {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new BadRequestException('amount must be a positive integer');
    }
    return BigInt(value);
  }

  private toHttp(error: LedgerError): Error {
    switch (error.code) {
      case 'INSUFFICIENT_FUNDS':
      case 'HOURLY_LIMIT':
      case 'ALREADY_ROLLED_BACK':
        return new ConflictException(error.message);
      case 'BET_NOT_FOUND':
      case 'ORIGINAL_NOT_FOUND':
      case 'INVALID_ROLLBACK':
        return new UnprocessableEntityException(error.message);
      case 'INVALID_AMOUNT':
        return new BadRequestException(error.message);
      default: {
        const neverCode: never = error.code;
        return new BadRequestException(String(neverCode));
      }
    }
  }
}
