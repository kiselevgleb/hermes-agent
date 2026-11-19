import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { asBigint } from '../common/money';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerGateway, WalletLock } from './ledger.gateway';
import { StoredTx, TxType } from './ledger';
import { LOCK_WALLET_SQL, RECENT_BETS_SQL } from './sql';

type TxRow = {
  id: string;
  externalId: string;
  type: string;
  amount: bigint | number | string;
  balanceAfter: bigint | number | string;
  referenceExternalId: string | null;
};

@Injectable()
export class PrismaLedgerGateway extends LedgerGateway {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async run<T>(walletId: string, work: (lock: WalletLock) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(
      async (tx) => {
        const locked = await tx.$queryRawUnsafe<Array<{ id: string; balance: bigint | number | string; version: number }>>(
          LOCK_WALLET_SQL,
          walletId,
        );
        const row = locked[0];
        const wallet = row
          ? { id: row.id, balance: asBigint(row.balance), version: Number(row.version) }
          : null;

        const lock: WalletLock = {
          wallet,
          findTx: async (externalId) => {
            const found = await tx.transaction.findUnique({
              where: { walletId_externalId: { walletId, externalId } },
            });
            return found ? toStored(found) : null;
          },
          findRollback: async (originalExternalId) => {
            const found = await tx.transaction.findFirst({
              where: { walletId, type: 'rollback', referenceExternalId: originalExternalId },
            });
            return found ? toStored(found) : null;
          },
          recentBetSum: async () => {
            const totals = await tx.$queryRawUnsafe<Array<{ total: string }>>(RECENT_BETS_SQL, walletId);
            return asBigint(totals[0]?.total ?? '0');
          },
          commitNew: async (stored, nextBalance) => {
            await tx.transaction.create({
              data: {
                id: stored.id,
                walletId,
                externalId: stored.externalId,
                type: stored.type,
                amount: stored.amount,
                balanceAfter: stored.balanceAfter,
                referenceExternalId: stored.referenceExternalId,
              },
            });
            await tx.wallet.update({
              where: { id: walletId },
              data: { balance: nextBalance, version: { increment: 1 } },
            });
          },
        };

        return work(lock);
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
        maxWait: 10_000,
        timeout: 10_000,
      },
    );
  }
}

function toStored(row: TxRow): StoredTx {
  if (!isTxType(row.type)) {
    throw new Error(`unexpected transaction type ${row.type}`);
  }
  return {
    id: row.id,
    externalId: row.externalId,
    type: row.type,
    amount: asBigint(row.amount),
    balanceAfter: asBigint(row.balanceAfter),
    referenceExternalId: row.referenceExternalId,
  };
}

function isTxType(value: string): value is TxType {
  return value === 'deposit' || value === 'bet' || value === 'win' || value === 'rollback';
}
