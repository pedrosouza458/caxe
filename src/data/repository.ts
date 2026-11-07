import type { Database } from "./database.ts";
import {
  categorySchema,
  walletSchema,
  transactionSchema,
  preferenceSchema,
  defaultPreferences,
  payloadSchemas,
  operationSchema,
} from "../domain/model.ts";
import type {
  Category,
  Wallet,
  Transaction,
  Preferences,
  EntityType,
  Operation,
  RemoteRecord,
} from "../domain/model.ts";

export class Repository {
  constructor(
    public db: Database,
    private uid: () => string,
  ) {}
  wallets() {
    return this.db.getAllSync<Wallet>(
      "SELECT * FROM wallets ORDER BY institution,name",
    );
  }
  categories() {
    return this.db.getAllSync<Category>(
      "SELECT * FROM categories ORDER BY name",
    );
  }
  preferences(): Preferences {
    const row = this.db.getFirstSync<{ payload: string }>(
      "SELECT payload FROM preferences WHERE id=?",
      "main",
    );
    return row
      ? preferenceSchema.parse(JSON.parse(row.payload))
      : { ...defaultPreferences };
  }
  savePreferences(value: Preferences) {
    this.save("preferences", "main", preferenceSchema.parse(value));
  }
  saveWallet(value: Wallet) {
    const v = walletSchema.parse(value);
    this.save("wallet", v.id, v);
  }
  saveCategory(value: Category) {
    const v = categorySchema.parse(value);
    this.save("category", v.id, v);
  }
  duplicateCandidates(
    transaction: Pick<
      Transaction,
      "id" | "walletId" | "kind" | "amountCents" | "localDate"
    >,
  ) {
    return this.db.getAllSync<{
      id: string;
      title: string;
      amountCents: number;
    }>(
      "SELECT id,title,amountCents FROM transactions WHERE id<>? AND walletId=? AND kind=? AND amountCents=? AND localDate=? AND status='confirmed' AND deleted=0 AND duplicateOf IS NULL ORDER BY occurredAt DESC LIMIT 20",
      transaction.id,
      transaction.walletId,
      transaction.kind,
      transaction.amountCents,
      transaction.localDate,
    );
  }
  saveTransaction(value: Transaction) {
    const v = transactionSchema.parse(value);
    const wallet = this.db.getFirstSync<Wallet>(
      "SELECT * FROM wallets WHERE id=?",
      v.walletId,
    );
    if (!wallet) throw new Error("Selecione uma carteira existente.");
    if (
      v.kind === "topup" &&
      !["food", "meal", "benefit"].includes(wallet.kind)
    )
      throw new Error("A recarga precisa entrar em uma carteira de benefício.");
    if (v.kind === "income" && wallet.kind !== "account")
      throw new Error(
        "Salário e receitas precisam entrar em uma conta bancária.",
      );
    const source =
      v.sourceKey &&
      this.db.getFirstSync<{ id: string }>(
        "SELECT id FROM transactions WHERE sourceKey=?",
        v.sourceKey,
      );
    if (source && source.id !== v.id) return;
    const dependents = this.db.getAllSync<Transaction>(
      "SELECT * FROM transactions WHERE refundOf=? AND deleted=0 AND duplicateOf IS NULL",
      v.id,
    );
    if (
      dependents.length &&
      (v.deleted ||
        v.duplicateOf ||
        v.kind !== "expense" ||
        v.status !== "confirmed" ||
        dependents.some(
          (t) => t.walletId !== v.walletId || t.localDate < v.localDate,
        ) ||
        dependents.reduce((sum, t) => sum + t.amountCents, 0) > v.amountCents)
    )
      throw new Error(
        "Revise os estornos vinculados antes de alterar esta compra.",
      );
    if (v.refundOf) {
      const original = this.db.getFirstSync<Transaction>(
        "SELECT * FROM transactions WHERE id=? AND deleted=0 AND duplicateOf IS NULL",
        v.refundOf,
      );
      if (
        !original ||
        original.kind !== "expense" ||
        original.status !== "confirmed" ||
        original.walletId !== v.walletId ||
        v.kind !== "refund" ||
        v.localDate < original.localDate
      )
        throw new Error(
          "Vincule o estorno a uma compra anterior da mesma carteira.",
        );
      const refunded = this.db.getFirstSync<{ total: number }>(
        "SELECT coalesce(sum(amountCents),0) total FROM transactions WHERE refundOf=? AND id<>? AND deleted=0 AND duplicateOf IS NULL",
        v.refundOf,
        v.id,
      )!.total;
      if (
        !v.deleted &&
        !v.duplicateOf &&
        refunded + v.amountCents > original.amountCents
      )
        throw new Error("O estorno excede o valor da compra.");
      v.categoryId = original.categoryId;
    }
    if (
      v.duplicateOf &&
      !this.db.getFirstSync(
        "SELECT id FROM transactions WHERE id=? AND duplicateOf IS NULL AND deleted=0 AND status='confirmed' AND walletId=? AND kind=?",
        v.duplicateOf,
        v.walletId,
        v.kind,
      )
    )
      throw new Error(
        "Selecione uma movimentação original confirmada do mesmo tipo e carteira.",
      );
    this.save("transaction", v.id, v);
  }
  save(entity: EntityType, entityId: string, payload: unknown) {
    const valid = payloadSchemas[entity].parse(payload);
    this.db.withTransactionSync(() => {
      this.apply(entity, valid);
      const expectedVersion =
        this.db.getFirstSync<{ version: number }>(
          "SELECT version FROM versions WHERE entity=? AND entityId=?",
          entity,
          entityId,
        )?.version ?? 0;
      this.db.runSync(
        "INSERT OR REPLACE INTO outbox VALUES (?,?,?,?,?)",
        entity,
        entityId,
        this.uid(),
        JSON.stringify(valid),
        expectedVersion,
      );
      this.db.runSync(
        "UPDATE sync_conflicts SET localPayload=? WHERE entity=? AND entityId=?",
        JSON.stringify(valid),
        entity,
        entityId,
      );
    });
  }
  apply(entity: EntityType, raw: unknown) {
    if (entity === "preferences") {
      const p = preferenceSchema.parse(raw);
      this.db.runSync(
        "INSERT OR REPLACE INTO preferences VALUES (?,?)",
        "main",
        JSON.stringify(p),
      );
    }
    if (entity === "wallet") {
      const w = walletSchema.parse(raw);
      this.db.runSync(
        "INSERT INTO wallets VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,institution=excluded.institution,kind=excluded.kind,openingCents=excluded.openingCents,openingDate=excluded.openingDate",
        w.id,
        w.name,
        w.institution,
        w.kind,
        w.openingCents,
        w.openingDate,
      );
    }
    if (entity === "category") {
      const c = categorySchema.parse(raw);
      this.db.runSync(
        "INSERT OR REPLACE INTO categories VALUES (?,?,?,?)",
        c.id,
        c.name,
        c.icon,
        c.color,
      );
    }
    if (entity === "transaction") {
      const t = transactionSchema.parse(raw);
      // Source identities belong to the original event even after reconciliation.
      const source =
        t.sourceKey &&
        this.db.getFirstSync<{ id: string }>(
          "SELECT id FROM transactions WHERE sourceKey=?",
          t.sourceKey,
        );
      if (source && source.id !== t.id) {
        this.db.runSync(
          "UPDATE transactions SET sourceKey=NULL,duplicateOf=? WHERE id=?",
          t.id,
          source.id,
        );
      }
      this.db.runSync(
        "INSERT OR REPLACE INTO transactions (id,walletId,categoryId,title,amountCents,kind,occurredAt,localDate,status,sourceKey,duplicateOf,refundOf,deleted) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
        t.id,
        t.walletId,
        t.categoryId,
        t.title,
        t.amountCents,
        t.kind,
        t.occurredAt,
        t.localDate,
        t.status,
        t.sourceKey,
        t.duplicateOf,
        t.refundOf,
        Number(t.deleted),
      );
    }
  }
  pending(): Operation[] {
    return this.db
      .getAllSync<{
        entity: string;
        entityId: string;
        opId: string;
        payload: string;
        expectedVersion: number;
      }>(
        "SELECT * FROM outbox ORDER BY CASE entity WHEN 'wallet' THEN 0 WHEN 'category' THEN 1 WHEN 'transaction' THEN 2 ELSE 3 END,CASE WHEN json_extract(payload,'$.duplicateOf') IS NOT NULL THEN 2 WHEN json_extract(payload,'$.kind')='refund' THEN 1 ELSE 0 END",
      )
      .map((x) =>
        operationSchema.parse({ ...x, payload: JSON.parse(x.payload) }),
      );
  }
  receive(
    records: RemoteRecord[],
    acknowledged: string[] = [],
    submitted: Operation[] = [],
  ) {
    this.db.withTransactionSync(() => {
      for (const opId of acknowledged)
        this.db.runSync("DELETE FROM outbox WHERE opId=?", opId);
      for (const r of [...records].sort(
        (a, b) =>
          ({ wallet: 0, category: 1, transaction: 2, preferences: 3 })[
            a.entity
          ] -
          { wallet: 0, category: 1, transaction: 2, preferences: 3 }[b.entity],
      )) {
        const payload = payloadSchemas[r.entity].parse(r.payload);
        const known =
          this.db.getFirstSync<{ version: number }>(
            "SELECT version FROM versions WHERE entity=? AND entityId=?",
            r.entity,
            r.entityId,
          )?.version ?? 0;
        if (r.version < known) continue;
        const pending = this.db.getFirstSync<{
          payload: string;
          expectedVersion: number;
        }>(
          "SELECT payload,expectedVersion FROM outbox WHERE entity=? AND entityId=?",
          r.entity,
          r.entityId,
        );
        this.db.runSync(
          "INSERT OR REPLACE INTO versions VALUES (?,?,?)",
          r.entity,
          r.entityId,
          r.version,
        );
        if (pending) {
          if (pending.expectedVersion === r.version) continue;
          const acceptedOwnVersion = submitted.some(
            (op) =>
              acknowledged.includes(op.opId) &&
              op.entity === r.entity &&
              op.entityId === r.entityId &&
              JSON.stringify(payloadSchemas[r.entity].parse(op.payload)) ===
                JSON.stringify(payload),
          );
          if (r.entity === "preferences" || acceptedOwnVersion)
            this.db.runSync(
              "UPDATE outbox SET expectedVersion=?,opId=? WHERE entity=? AND entityId=?",
              r.version,
              this.uid(),
              r.entity,
              r.entityId,
            );
          else
            this.db.runSync(
              "INSERT OR REPLACE INTO sync_conflicts VALUES (?,?,?,?,?)",
              r.entity,
              r.entityId,
              pending.payload,
              JSON.stringify(payload),
              r.version,
            );
        } else this.apply(r.entity, payload);
      }
    });
  }
  conflicts() {
    return this.db.getAllSync<{
      entity: EntityType;
      entityId: string;
      localPayload: string;
      remotePayload: string;
      version: number;
    }>("SELECT * FROM sync_conflicts");
  }
  resolveConflict(
    entity: EntityType,
    entityId: string,
    choice: "local" | "remote",
  ) {
    const c = this.conflicts().find(
      (c) => c.entity === entity && c.entityId === entityId,
    );
    if (!c) return;
    this.db.withTransactionSync(() => {
      if (choice === "remote") {
        this.apply(entity, JSON.parse(c.remotePayload));
        this.db.runSync(
          "DELETE FROM outbox WHERE entity=? AND entityId=?",
          entity,
          entityId,
        );
      } else
        this.db.runSync(
          "UPDATE outbox SET expectedVersion=?,opId=? WHERE entity=? AND entityId=?",
          c.version,
          this.uid(),
          entity,
          entityId,
        );
      this.db.runSync(
        "DELETE FROM sync_conflicts WHERE entity=? AND entityId=?",
        entity,
        entityId,
      );
    });
  }
}
