import type { NeonQueryFunction } from "@neondatabase/serverless";
import { payloadSchemas } from "../../src/domain/model.ts";
import type { Operation } from "../../src/domain/model.ts";

export async function applyOperation(
  sql: NeonQueryFunction<false, false>,
  userId: string,
  op: Operation,
) {
  const payload = payloadSchemas[op.entity].parse(op.payload);
  const [changed] = await sql.transaction(
    [
      sql`WITH incoming AS (
    SELECT ${JSON.stringify(payload)}::jsonb p
  ), candidate AS (
    SELECT CASE WHEN duplicate.entity_id IS NOT NULL
      THEN incoming.p || jsonb_build_object('sourceKey',NULL,'duplicateOf',duplicate.entity_id)
      ELSE incoming.p END p
    FROM incoming LEFT JOIN sync_records duplicate ON duplicate.user_id=${userId}
      AND duplicate.entity='transaction' AND ${op.entity}='transaction'
      AND duplicate.entity_id<>${op.entityId}
      AND duplicate.payload->>'sourceKey'=incoming.p->>'sourceKey'
  ), valid AS (
    SELECT p FROM candidate WHERE ${op.entity}<>'transaction' OR (
      EXISTS(SELECT 1 FROM sync_records w WHERE w.user_id=${userId} AND w.entity='wallet' AND w.entity_id=p->>'walletId')
      AND (p->>'duplicateOf' IS NULL OR EXISTS(
        SELECT 1 FROM sync_records original WHERE original.user_id=${userId} AND original.entity='transaction'
        AND original.entity_id=p->>'duplicateOf' AND original.payload->>'duplicateOf' IS NULL
        AND original.payload->>'deleted'='false' AND original.payload->>'status'='confirmed' AND original.payload->>'walletId'=p->>'walletId'
        AND original.payload->>'kind'=p->>'kind'
      ))
      AND (p->>'kind'<>'refund' OR EXISTS(
        SELECT 1 FROM sync_records original WHERE original.user_id=${userId} AND original.entity='transaction'
        AND original.entity_id=p->>'refundOf' AND original.payload->>'kind'='expense'
        AND original.payload->>'status'='confirmed' AND original.payload->>'deleted'='false'
        AND original.payload->>'duplicateOf' IS NULL AND original.payload->>'walletId'=p->>'walletId'
        AND original.payload->>'localDate'<=p->>'localDate'
        AND ((p->>'deleted')::boolean OR p->>'duplicateOf' IS NOT NULL OR (p->>'amountCents')::bigint + (
          SELECT coalesce(sum((r.payload->>'amountCents')::bigint),0) FROM sync_records r
          WHERE r.user_id=${userId} AND r.entity='transaction' AND r.entity_id<>${op.entityId}
          AND r.payload->>'refundOf'=p->>'refundOf' AND r.payload->>'deleted'='false'
          AND r.payload->>'duplicateOf' IS NULL
        ) <= (original.payload->>'amountCents')::bigint)
      ))
      AND NOT EXISTS(
        SELECT 1 FROM sync_records r WHERE r.user_id=${userId} AND r.entity='transaction'
        AND r.payload->>'refundOf'=${op.entityId} AND r.payload->>'deleted'='false' AND r.payload->>'duplicateOf' IS NULL
        AND (p->>'deleted'='true' OR p->>'duplicateOf' IS NOT NULL OR p->>'kind'<>'expense'
          OR p->>'status'<>'confirmed' OR r.payload->>'walletId'<>p->>'walletId' OR r.payload->>'localDate'<p->>'localDate')
      )
      AND (p->>'kind'<>'expense' OR (p->>'amountCents')::bigint >= (
        SELECT coalesce(sum((r.payload->>'amountCents')::bigint),0) FROM sync_records r
        WHERE r.user_id=${userId} AND r.entity='transaction' AND r.payload->>'refundOf'=${op.entityId}
        AND r.payload->>'deleted'='false' AND r.payload->>'duplicateOf' IS NULL
      ))
    )
  ), changed AS (
    INSERT INTO sync_records(user_id,entity,entity_id,payload,version)
    SELECT ${userId},${op.entity},${op.entityId},p,1 FROM valid
    WHERE ${op.expectedVersion}=0 OR EXISTS(SELECT 1 FROM sync_records WHERE user_id=${userId} AND entity=${op.entity} AND entity_id=${op.entityId})
    ON CONFLICT(user_id,entity,entity_id) DO UPDATE SET payload=excluded.payload,version=sync_records.version+1
    WHERE sync_records.version=${op.expectedVersion} RETURNING 1
  ) INSERT INTO sync_receipts(user_id,op_id) SELECT ${userId},${op.opId} FROM changed ON CONFLICT DO NOTHING RETURNING op_id`,
    ],
    { isolationLevel: "Serializable" },
  );
  return changed!.length > 0;
}
