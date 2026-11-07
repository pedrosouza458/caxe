import { z } from "zod";

export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(`${v}T12:00:00Z`);
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v;
  }, "Data inválida");
const id = z.string().min(1).max(120);
const cents = z.number().int().nonnegative().max(1_000_000_000_000);
export const walletKinds = [
  "account",
  "credit",
  "food",
  "meal",
  "benefit",
] as const;
export const transactionKinds = [
  "expense",
  "income",
  "refund",
  "transfer_in",
  "transfer_out",
  "bill_payment",
  "topup",
] as const;
export const iconNames = [
  "cart",
  "utensils",
  "car",
  "heart",
  "home",
  "calendar",
  "book",
  "ticket",
  "bag",
  "arrows",
  "income",
  "other",
] as const;
export const colorNames = [
  "lime",
  "coral",
  "blue",
  "lilac",
  "sand",
  "mint",
  "rose",
  "slate",
  "orange",
  "teal",
  "olive",
  "plum",
] as const;
export const categorySchema = z.object({
  id,
  name: z.string().min(1).max(80),
  icon: z.enum(iconNames),
  color: z.enum(colorNames),
});
export const walletSchema = z.object({
  id,
  name: z.string().min(1).max(80),
  institution: z.string().min(1).max(80),
  kind: z.enum(walletKinds),
  openingCents: cents.nullable(),
  openingDate: dateSchema,
});
export const transactionSchema = z
  .object({
    id,
    walletId: id,
    categoryId: id.nullable(),
    title: z.string().min(1).max(160),
    amountCents: cents.refine((v) => v > 0),
    kind: z.enum(transactionKinds),
    occurredAt: z.iso.datetime({ offset: true }),
    localDate: dateSchema,
    status: z.enum(["confirmed", "pending"]),
    sourceKey: id.nullable(),
    duplicateOf: id.nullable(),
    refundOf: id.nullable(),
    deleted: z.boolean().default(false),
  })
  .refine(
    (t) => t.id !== t.duplicateOf && t.id !== t.refundOf,
    "Uma movimentação não pode referenciar a si mesma",
  )
  .refine(
    (t) => (t.kind === "refund") === Boolean(t.refundOf),
    "Estornos precisam de uma compra original",
  );
export const filterSchema = z
  .object({
    start: dateSchema,
    end: dateSchema,
    institutions: z.array(z.string().max(80)).max(100).default([]),
    walletIds: z.array(id).max(100).default([]),
    walletKinds: z.array(z.enum(walletKinds)).max(5).default([]),
    categoryIds: z.array(id).max(100).default([]),
    movement: z
      .enum(["all", "in", "out", "consumption", "financial"])
      .default("all"),
  })
  .refine(
    (f) => f.start <= f.end && daysBetween(f.start, f.end) <= 3660,
    "Selecione um período válido de até 10 anos",
  );
export const preferenceSchema = z.object({
  iconMode: z.enum(["institution", "category"]).default("institution"),
  theme: z.enum(["system", "light", "dark"]).default("system"),
  hidden: z.boolean().default(false),
  filters: filterSchema.optional(),
});
export type Category = z.infer<typeof categorySchema>;
export type Wallet = z.infer<typeof walletSchema>;
export type Transaction = z.infer<typeof transactionSchema>;
export type Filters = z.infer<typeof filterSchema>;
export type Preferences = z.infer<typeof preferenceSchema>;
export type EntityType = "wallet" | "category" | "transaction" | "preferences";
export const payloadSchemas = {
  wallet: walletSchema,
  category: categorySchema,
  transaction: transactionSchema,
  preferences: preferenceSchema,
};
export const operationSchema = z
  .object({
    opId: id,
    entity: z.enum(["wallet", "category", "transaction", "preferences"]),
    entityId: id,
    payload: z.unknown(),
    expectedVersion: z.number().int().nonnegative(),
  })
  .superRefine((op, ctx) => {
    const result = payloadSchemas[op.entity].safeParse(op.payload);
    if (!result.success)
      ctx.addIssue({ code: "custom", message: "Dados inválidos" });
    if (
      op.entity === "preferences"
        ? op.entityId !== "main"
        : (op.payload as { id?: string })?.id !== op.entityId
    )
      ctx.addIssue({ code: "custom", message: "Identificador incompatível" });
  });
export type Operation = z.infer<typeof operationSchema>;
export const remoteRecordSchema = z.object({
  entity: z.enum(["wallet", "category", "transaction", "preferences"]),
  entityId: id,
  payload: z.unknown(),
  version: z.number().int().positive(),
});
export type RemoteRecord = z.infer<typeof remoteRecordSchema>;
export const defaultPreferences: Preferences = {
  iconMode: "institution",
  theme: "system",
  hidden: false,
};
export const defaultCategories: Category[] = [
  ["market", "Supermercado", "cart", "lime"],
  ["restaurant", "Restaurantes", "utensils", "coral"],
  ["transport", "Transporte", "car", "blue"],
  ["health", "Saúde", "heart", "rose"],
  ["housing", "Moradia", "home", "sand"],
  ["subscriptions", "Assinaturas", "calendar", "lilac"],
  ["education", "Educação", "book", "mint"],
  ["leisure", "Lazer", "ticket", "orange"],
  ["shopping", "Compras", "bag", "teal"],
  ["transfer", "Transferências", "arrows", "olive"],
  ["income", "Receitas", "income", "plum"],
  ["other", "Outros", "other", "slate"],
].map(([id, name, icon, color]) =>
  categorySchema.parse({ id, name, icon, color }),
);

export function localDate(
  instant: string | Date,
  zone = "America/Sao_Paulo",
): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(instant));
  const p = (type: string) => parts.find((x) => x.type === type)!.value;
  return `${p("year")}-${p("month")}-${p("day")}`;
}
export function addDays(date: string, days: number) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
export function daysBetween(a: string, b: string) {
  return Math.round(
    (Date.parse(`${b}T12:00Z`) - Date.parse(`${a}T12:00Z`)) / 86400000,
  );
}
export type Period =
  "today" | "7d" | "30d" | "month" | "previous" | "3m" | "6m" | "12m";
export function periodRange(period: Period, today = localDate(new Date())) {
  const first = `${today.slice(0, 7)}-01`;
  if (period === "today") return { start: today, end: today };
  if (period === "7d" || period === "30d")
    return { start: addDays(today, period === "7d" ? -6 : -29), end: today };
  if (period === "month") return { start: first, end: today };
  if (period === "previous") {
    const end = addDays(first, -1);
    return { start: `${end.slice(0, 7)}-01`, end };
  }
  const d = new Date(`${first}T12:00Z`);
  d.setUTCMonth(d.getUTCMonth() - (Number.parseInt(period) - 1));
  return { start: d.toISOString().slice(0, 10), end: today };
}
export function previousRange(f: Pick<Filters, "start" | "end">) {
  if (f.start.endsWith("-01") && f.start.slice(0, 7) === f.end.slice(0, 7)) {
    const endOfPrevious = addDays(f.start, -1);
    const start = `${endOfPrevious.slice(0, 7)}-01`;
    const end = addDays(
      start,
      Math.min(Number(f.end.slice(-2)), Number(endOfPrevious.slice(-2))) - 1,
    );
    return { start, end };
  }
  const length = daysBetween(f.start, f.end) + 1;
  return { start: addDays(f.start, -length), end: addDays(f.start, -1) };
}
export function percentChange(current: number, previous: number) {
  return previous > 0 ? ((current - previous) / previous) * 100 : null;
}
export function percentage(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "percent",
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(value / 100);
}
export function money(cents: number, hidden = false) {
  return hidden
    ? "••••"
    : new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
      }).format(cents / 100);
}
export function parseMoney(value: string): number {
  if (!/^\d{1,10}(,\d{1,2})?$/.test(value))
    throw new Error("Use um valor como 82,90, sem pontos.");
  const [whole, fraction = ""] = value.split(",");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}
