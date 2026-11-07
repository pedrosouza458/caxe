import { Hono } from "hono";
import { cors } from "hono/cors";
import { bodyLimit } from "hono/body-limit";
import { neon } from "@neondatabase/serverless";
import { z } from "zod";
import { createAuth } from "./auth";
import type { Bindings } from "./auth";
import { operationSchema } from "../../src/domain/model";
import type { RemoteRecord } from "../../src/domain/model";
import { applyOperation } from "./sync-operation";

const app = new Hono<{ Bindings: Bindings }>();
app.use(
  "/api/*",
  cors({
    origin: (origin, c) => (origin === c.env.APP_ORIGIN ? origin : ""),
    credentials: true,
  }),
);
app.use("/api/*", bodyLimit({ maxSize: 512_000 }));
app.all("/api/auth/*", (c) => createAuth(c.env).handler(c.req.raw));
app.get("/health", (c) => c.json({ ok: true, app: "Caxe" }));
const requestSchema = z.object({
  operations: z.array(operationSchema).max(100),
  cursor: z.string().max(400).nullable(),
});
app.post("/api/sync", async (c) => {
  const session = await createAuth(c.env).api.getSession({
    headers: c.req.raw.headers,
  });
  if (!session) return c.json({ error: "Não autenticado" }, 401);
  const parsed = requestSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: "Dados inválidos" }, 400);
  let cursor: [number, string] = [-1, ""];
  if (parsed.data.cursor) {
    try {
      cursor = z
        .tuple([z.number().int().min(0).max(3), z.string()])
        .parse(JSON.parse(parsed.data.cursor));
    } catch {
      return c.json({ error: "Cursor inválido" }, 400);
    }
  }
  const sql = neon(c.env.DATABASE_URL);
  const userId = session.user.id;
  const acknowledged: string[] = [];
  const conflicts: RemoteRecord[] = [];
  for (const op of parsed.data.operations) {
    if (
      (
        await sql`SELECT 1 FROM sync_receipts WHERE user_id=${userId} AND op_id=${op.opId}`
      ).length
    ) {
      acknowledged.push(op.opId);
      continue;
    }
    const changed = await applyOperation(sql, userId, op);
    if (changed) acknowledged.push(op.opId);
    else {
      const rows =
        await sql`SELECT entity,entity_id AS "entityId",payload,version FROM sync_records WHERE user_id=${userId} AND entity=${op.entity} AND entity_id=${op.entityId}`;
      if (rows[0]) conflicts.push(rows[0] as RemoteRecord);
    }
  }
  const rows =
    await sql`WITH ranked AS (SELECT entity,entity_id AS "entityId",payload,version,CASE entity WHEN 'wallet' THEN 0 WHEN 'category' THEN 1 WHEN 'transaction' THEN 2 ELSE 3 END rank FROM sync_records WHERE user_id=${userId}) SELECT * FROM ranked WHERE (rank,"entityId")>(${cursor[0]},${cursor[1]}) ORDER BY rank,"entityId" LIMIT 201`;
  const records = rows.slice(0, 200);
  const last = records.at(-1);
  return c.json({
    records,
    acknowledged,
    conflicts,
    next:
      rows.length > 200 && last
        ? JSON.stringify([last.rank, last.entityId])
        : null,
  });
});
app.onError((err, c) => {
  console.error("Caxe API error", err.name);
  return c.json(
    { error: "Não foi possível sincronizar. Tente novamente." },
    500,
  );
});
export default app;
