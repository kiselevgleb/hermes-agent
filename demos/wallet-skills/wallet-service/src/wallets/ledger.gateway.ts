import { StoredTx } from './ledger';

export interface LockedWallet {
  id: string;
  balance: bigint;
  version: number;
}

/** A wallet row locked with SELECT ... FOR UPDATE, plus the reads done under that lock. */
export interface WalletLock {
  readonly wallet: LockedWallet | null;
  findTx(externalId: string): Promise<StoredTx | null>;
  findRollback(originalExternalId: string): Promise<StoredTx | null>;
  recentBetSum(): Promise<bigint>;
  commitNew(tx: StoredTx, nextBalance: bigint): Promise<void>;
}

export abstract class LedgerGateway {
  abstract run<T>(walletId: string, work: (lock: WalletLock) => Promise<T>): Promise<T>;
}
