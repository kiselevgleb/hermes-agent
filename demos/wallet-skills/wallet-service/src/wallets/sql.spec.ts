import { LIST_PLAYERS_AFTER_SQL, LIST_PLAYERS_SQL, LOCK_WALLET_SQL, RECENT_BETS_SQL } from './sql';

describe('ledger SQL', () => {
  it('locks the wallet row inside the money transaction', () => {
    expect(LOCK_WALLET_SQL.toLowerCase()).toContain('for update');
    expect(LOCK_WALLET_SQL).toContain('$1');
  });

  it('lists players and wallets in one join, without OFFSET', () => {
    for (const sql of [LIST_PLAYERS_SQL, LIST_PLAYERS_AFTER_SQL]) {
      expect(sql.toLowerCase()).toContain('inner join wallets');
      expect(sql.toLowerCase()).not.toContain('offset');
    }
  });

  it('reads recent bets by wallet and created_at so the composite index applies', () => {
    const sql = RECENT_BETS_SQL.toLowerCase();
    expect(sql).toContain('from transactions');
    expect(sql).toContain('wallet_id');
    expect(sql).toContain('created_at');
    expect(sql).toContain('$1');
  });
});
