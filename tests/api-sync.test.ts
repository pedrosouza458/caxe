import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import type { NeonQueryFunction } from "@neondatabase/serverless";
import { applyOperation } from "../api/src/sync-operation.ts";
import { wallet, tx } from "./helpers.ts";
import type { Operation } from "../src/domain/model.ts";

test("PostgreSQL: isolamento por usuário, CAS, deduplicação e integridade dos estornos", async () => {
  const pg = new PGlite();
  await pg.exec(`CREATE TABLE sync_records(user_id text,entity text,entity_id text,payload jsonb,version integer,PRIMARY KEY(user_id,entity,entity_id));
 CREATE UNIQUE INDEX source_per_user ON sync_records(user_id,(payload->>'sourceKey')) WHERE entity='transaction' AND payload->>'sourceKey' IS NOT NULL;
 CREATE TABLE sync_receipts(user_id text,op_id text,PRIMARY KEY(user_id,op_id));`);
  type Query = { sql: string; params: unknown[] };
  const tag = (strings: TemplateStringsArray, ...params: unknown[]) => ({
    sql: strings.reduce(
      (s, x, i) => s + x + (i < params.length ? `$${i + 1}` : ""),
      "",
    ),
    params,
  });
  const sql = Object.assign(tag, {
    transaction: async (queries: Query[]) =>
      pg.transaction(async (t) => {
        await t.exec("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE");
        const results = [];
        for (const q of queries)
          results.push((await t.query(q.sql, q.params)).rows);
        return results;
      }),
  }) as unknown as NeonQueryFunction<false, false>;
  let seq = 0;
  const op = (
    entity: Operation["entity"],
    entityId: string,
    payload: unknown,
    expectedVersion = 0,
  ): Operation => ({
    opId: `op${++seq}`,
    entity,
    entityId,
    payload,
    expectedVersion,
  });
  try {
    assert.equal(
      await applyOperation(sql, "alice", op("wallet", "bank", wallet())),
      true,
    );
    const purchase = tx({
      id: "purchase",
      sourceKey: "bank-event-1",
      amountCents: 5000,
    });
    assert.equal(
      await applyOperation(
        sql,
        "bob",
        op("transaction", purchase.id, purchase),
      ),
      false,
      "another user cannot reference Alice’s wallet",
    );
    assert.equal(
      await applyOperation(
        sql,
        "alice",
        op("transaction", purchase.id, purchase),
      ),
      true,
    );
    assert.equal(
      await applyOperation(
        sql,
        "alice",
        op("transaction", purchase.id, { ...purchase, amountCents: 6000 }, 0),
      ),
      false,
      "stale version cannot overwrite",
    );
    assert.equal(
      await applyOperation(
        sql,
        "alice",
        op("transaction", purchase.id, { ...purchase, amountCents: 6000 }, 1),
      ),
      true,
    );
    const duplicate = tx({
      id: "duplicate",
      sourceKey: "bank-event-1",
      amountCents: 6000,
    });
    assert.equal(
      await applyOperation(
        sql,
        "alice",
        op("transaction", duplicate.id, duplicate),
      ),
      true,
    );
    const row = (
      await pg.query<{ payload: { sourceKey: null; duplicateOf: string } }>(
        "SELECT payload FROM sync_records WHERE user_id='alice' AND entity_id='duplicate'",
      )
    ).rows[0]!;
    assert.equal(row.payload.duplicateOf, "purchase");
    assert.equal(row.payload.sourceKey, null);
    const refund = tx({
      id: "refund",
      kind: "refund",
      refundOf: "purchase",
      amountCents: 4000,
    });
    assert.equal(
      await applyOperation(sql, "alice", op("transaction", refund.id, refund)),
      true,
    );
    const excessive = tx({
      kind: "refund",
      refundOf: "purchase",
      amountCents: 3000,
    });
    assert.equal(
      await applyOperation(
        sql,
        "alice",
        op("transaction", excessive.id, excessive),
      ),
      false,
      "sum of refunds is bounded by purchase",
    );
    assert.equal(
      await applyOperation(
        sql,
        "alice",
        op("transaction", "purchase", { ...purchase, deleted: true }, 2),
      ),
      false,
      "purchase with refunds cannot disappear",
    );
    assert.equal(
      await applyOperation(
        sql,
        "alice",
        op("transaction", "purchase", { ...purchase, amountCents: 1000 }, 2),
      ),
      false,
      "purchase cannot shrink below refunds",
    );
    const foreign = tx({
      id: "foreign",
      kind: "refund",
      refundOf: "purchase",
      amountCents: 1000,
    });
    assert.equal(
      await applyOperation(sql, "bob", op("wallet", "bank", wallet())),
      true,
    );
    assert.equal(
      await applyOperation(sql, "bob", op("transaction", foreign.id, foreign)),
      false,
      "refund cannot reference another user",
    );
    assert.equal(
      await applyOperation(
        sql,
        "bob",
        op("transaction", purchase.id, purchase),
      ),
      true,
      "identical IDs belong to independent accounts",
    );
    assert.equal(
      (await pg.query("SELECT * FROM sync_receipts")).rows.length,
      7,
    );
  } finally {
    await pg.close();
  }
});
