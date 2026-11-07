import { DatabaseSync } from "node:sqlite";
import type { Database, Param } from "../src/data/database.ts";
import { migrate } from "../src/data/database.ts";
import { Repository } from "../src/data/repository.ts";
import { Analytics } from "../src/domain/analytics.ts";
import type { Transaction, Filters, Wallet } from "../src/domain/model.ts";
export function fixture(filename = ":memory:") {
  const sqlite = new DatabaseSync(filename);
  let seq = 0;
  const db: Database = {
    execSync: (s) => sqlite.exec(s),
    runSync: (s, ...p) => sqlite.prepare(s).run(...p),
    getAllSync: <T>(s: string, ...p: Param[]) =>
      sqlite.prepare(s).all(...p) as T[],
    getFirstSync: <T>(s: string, ...p: Param[]) =>
      (sqlite.prepare(s).get(...p) as T) ?? null,
    withTransactionSync: (task) => {
      sqlite.exec("BEGIN");
      try {
        task();
        sqlite.exec("COMMIT");
      } catch (e) {
        sqlite.exec("ROLLBACK");
        throw e;
      }
    },
  };
  migrate(db);
  const repo = new Repository(db, () => `op-${Date.now()}-${++seq}`);
  const analytics = new Analytics(db);
  return { sqlite, db, repo, analytics };
}
export const filter: Filters = {
  start: "2026-11-01",
  end: "2026-11-07",
  institutions: [],
  walletIds: [],
  walletKinds: [],
  categoryIds: [],
  movement: "all",
};
export function wallet(overrides: Partial<Wallet> = {}): Wallet {
  return {
    id: "bank",
    name: "Conta",
    institution: "Nubank",
    kind: "account",
    openingCents: 100000,
    openingDate: "2026-11-01",
    ...overrides,
  };
}
let counter = 0;
export function tx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: `t${++counter}`,
    walletId: "bank",
    categoryId: "market",
    title: "Mercado",
    amountCents: 1000,
    kind: "expense",
    occurredAt: "2026-11-03T15:00:00Z",
    localDate: "2026-11-03",
    status: "confirmed",
    sourceKey: null,
    duplicateOf: null,
    refundOf: null,
    deleted: false,
    ...overrides,
  };
}
