import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { StoredTx } from './ledger';
import { LedgerGateway, WalletLock } from './ledger.gateway';
import { WalletsService } from './wallets.service';

class MemoryGateway extends LedgerGateway {
  wallets = new Map<string, { balance: bigint; version: number }>();
  txs: Array<StoredTx & { walletId: string }> = [];
  commits = 0;
  recentCalls = 0;
  recent = 0n;

  async run<T>(walletId: string, work: (lock: WalletLock) => Promise<T>): Promise<T> {
    const current = this.wallets.get(walletId);
    const lock: WalletLock = {
      wallet: current ? { id: walletId, balance: current.balance, version: current.version } : null,
      findTx: async (externalId) => this.txs.find((row) => row.walletId === walletId && row.externalId === externalId) ?? null,
      findRollback: async (originalExternalId) =>
        this.txs.find(
          (row) =>
            row.walletId === walletId && row.type === 'rollback' && row.referenceExternalId === originalExternalId,
        ) ?? null,
      recentBetSum: async () => {
        this.recentCalls += 1;
        return this.recent;
      },
      commitNew: async (stored, nextBalance) => {
        this.txs.push({ ...stored, walletId });
        this.wallets.set(walletId, { balance: nextBalance, version: (current?.version ?? 0) + 1 });
        this.commits += 1;
      },
    };
    return work(lock);
  }
}

describe('WalletsService', () => {
  let gateway: MemoryGateway;
  let service: WalletsService;

  beforeEach(() => {
    gateway = new MemoryGateway();
    gateway.wallets.set('w1', { balance: 0n, version: 0 });
    service = new WalletsService(gateway, 100n);
  });

  it('credits a deposit once when the same external id is repeated', async () => {
    const first = await service.deposit('w1', 'dep-1', 100);
    const again = await service.deposit('w1', 'dep-1', 999);
    expect(first.idempotentReplay).toBe(false);
    expect(first.balanceAfter).toBe(100);
    expect(again).toMatchObject({ id: first.id, balanceAfter: 100, idempotentReplay: true, amount: 100 });
    expect(gateway.commits).toBe(1);
    expect(gateway.wallets.get('w1')?.balance).toBe(100n);
  });

  it('keeps the stored result when the wallet balance has moved on', async () => {
    const first = await service.deposit('w1', 'dep-1', 100);
    gateway.wallets.set('w1', { balance: 1n, version: 5 });
    const again = await service.deposit('w1', 'dep-1', 100);
    expect(again.id).toBe(first.id);
    expect(again.balanceAfter).toBe(100);
    expect(gateway.wallets.get('w1')?.balance).toBe(1n);
    expect(gateway.commits).toBe(1);
  });

  it('does not read the hourly total when a bet is replayed', async () => {
    await service.deposit('w1', 'dep-1', 100);
    await service.bet('w1', 'bet-1', 40);
    expect(gateway.recentCalls).toBe(1);
    await service.bet('w1', 'bet-1', 40);
    expect(gateway.recentCalls).toBe(1);
    expect(gateway.wallets.get('w1')?.balance).toBe(60n);
  });

  it('rejects an hourly bet limit with the balance unchanged', async () => {
    gateway.recent = 90n;
    await expect(service.bet('w1', 'bet-1', 20)).rejects.toBeInstanceOf(ConflictException);
    expect(gateway.commits).toBe(0);
    expect(gateway.wallets.get('w1')?.balance).toBe(0n);
  });

  it('credits one win and leaves the balance unchanged on replay', async () => {
    await service.deposit('w1', 'dep-1', 100);
    await service.bet('w1', 'bet-1', 40);
    const win = await service.win('w1', 'win-1', 70, 'bet-1');
    const replay = await service.win('w1', 'win-1', 70, 'bet-1');
    expect(win.balanceAfter).toBe(130);
    expect(replay).toMatchObject({ id: win.id, balanceAfter: 130, idempotentReplay: true });
    expect(gateway.wallets.get('w1')?.balance).toBe(130n);
  });

  it('rejects a win that does not match a bet', async () => {
    await expect(service.win('w1', 'win-1', 10, 'missing')).rejects.toBeInstanceOf(UnprocessableEntityException);
    expect(gateway.commits).toBe(0);
  });

  it('rolls a bet back once', async () => {
    await service.deposit('w1', 'dep-1', 100);
    await service.bet('w1', 'bet-1', 40);
    const rolled = await service.rollback('w1', 'rb-1', 'bet-1');
    expect(rolled).toMatchObject({ type: 'rollback', amount: 40, balanceAfter: 100 });
    await expect(service.rollback('w1', 'rb-2', 'bet-1')).rejects.toBeInstanceOf(ConflictException);
    expect(gateway.wallets.get('w1')?.balance).toBe(100n);
  });

  it('returns 404 when the wallet does not exist', async () => {
    await expect(service.deposit('missing', 'dep-1', 10)).rejects.toBeInstanceOf(NotFoundException);
    expect(gateway.commits).toBe(0);
  });
});
