import { defaultCategories } from "../domain/model.ts";

export type Param = string | number | null;
export interface Database {
  execSync(sql: string): void;
  runSync(sql: string, ...params: Param[]): unknown;
  getAllSync<T>(sql: string, ...params: Param[]): T[];
  getFirstSync<T>(sql: string, ...params: Param[]): T | null;
  withTransactionSync(task: () => void): void;
}
export const schema = `
PRAGMA foreign_keys=ON;
PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS wallets (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, institution TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('account','credit','food','meal','benefit')),
 openingCents INTEGER, openingDate TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS categories (id TEXT PRIMARY KEY, name TEXT NOT NULL, icon TEXT NOT NULL, color TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS transactions (
 id TEXT PRIMARY KEY, walletId TEXT NOT NULL REFERENCES wallets(id), categoryId TEXT,
 title TEXT NOT NULL, amountCents INTEGER NOT NULL CHECK(amountCents>0), kind TEXT NOT NULL,
 occurredAt TEXT NOT NULL, localDate TEXT NOT NULL, status TEXT NOT NULL,
 sourceKey TEXT, duplicateOf TEXT, refundOf TEXT, deleted INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS tx_period ON transactions(localDate, status, deleted);
CREATE INDEX IF NOT EXISTS tx_wallet_period ON transactions(walletId, localDate);
CREATE INDEX IF NOT EXISTS tx_category_period ON transactions(categoryId, localDate);
CREATE UNIQUE INDEX IF NOT EXISTS tx_source ON transactions(sourceKey) WHERE sourceKey IS NOT NULL;
CREATE INDEX IF NOT EXISTS tx_refund ON transactions(refundOf);
CREATE TABLE IF NOT EXISTS preferences (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS outbox (entity TEXT NOT NULL, entityId TEXT NOT NULL, opId TEXT NOT NULL UNIQUE, payload TEXT NOT NULL, expectedVersion INTEGER NOT NULL, PRIMARY KEY(entity,entityId));
CREATE TABLE IF NOT EXISTS versions (entity TEXT NOT NULL, entityId TEXT NOT NULL, version INTEGER NOT NULL, PRIMARY KEY(entity,entityId));
CREATE TABLE IF NOT EXISTS sync_meta (id TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sync_conflicts (entity TEXT NOT NULL, entityId TEXT NOT NULL, localPayload TEXT NOT NULL, remotePayload TEXT NOT NULL, version INTEGER NOT NULL, PRIMARY KEY(entity,entityId));
CREATE TABLE IF NOT EXISTS capture_inbox (id TEXT PRIMARY KEY, text TEXT NOT NULL, source TEXT NOT NULL, receivedAt TEXT NOT NULL);
PRAGMA user_version=1;
`;
export function migrate(db: Database) {
  db.execSync(schema);
  for (const c of defaultCategories)
    db.runSync(
      "INSERT OR IGNORE INTO categories VALUES (?,?,?,?)",
      c.id,
      c.name,
      c.icon,
      c.color,
    );
}
export async function migrateAsync(db: {
  execAsync: (sql: string) => Promise<void>;
  runAsync: (sql: string, ...params: Param[]) => Promise<unknown>;
}) {
  await db.execAsync(schema);
  for (const c of defaultCategories)
    await db.runAsync(
      "INSERT OR IGNORE INTO categories VALUES (?,?,?,?)",
      c.id,
      c.name,
      c.icon,
      c.color,
    );
}
