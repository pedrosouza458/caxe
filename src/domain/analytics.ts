import type { Database, Param } from "../data/database.ts";
import {
  filterSchema,
  addDays,
  daysBetween,
  previousRange,
  percentChange,
} from "./model.ts";
import type { Filters, Wallet } from "./model.ts";

// Every screen uses this ledger: pending, deleted and reconciled rows never count.
// A refund reduces consumption on its posting date, with the original category.
const ledger = `WITH ledger AS (
 SELECT t.*,w.institution,w.name walletName,w.kind walletKind,
 CASE WHEN t.kind='refund' THEN coalesce(o.categoryId,t.categoryId) ELSE t.categoryId END metricCategory,
 CASE WHEN t.kind='expense' THEN t.amountCents WHEN t.kind='refund' AND o.id IS NOT NULL THEN -t.amountCents ELSE 0 END expense,
 CASE WHEN t.kind='income' THEN t.amountCents ELSE 0 END income,
 CASE WHEN t.kind IN ('income','refund','transfer_in','topup') THEN t.amountCents ELSE -t.amountCents END cash
 FROM transactions t JOIN wallets w ON w.id=t.walletId
 LEFT JOIN transactions o ON o.id=t.refundOf AND o.kind='expense' AND o.walletId=t.walletId AND o.status='confirmed' AND o.deleted=0 AND o.duplicateOf IS NULL
 WHERE t.status='confirmed' AND t.deleted=0 AND t.duplicateOf IS NULL
)`;
function where(raw: Filters) {
  const f = filterSchema.parse(raw);
  const args: Param[] = [f.start, f.end];
  const clauses = ["localDate BETWEEN ? AND ?"];
  for (const [column, values] of [
    ["institution", f.institutions],
    ["walletId", f.walletIds],
    ["walletKind", f.walletKinds],
    ["coalesce(metricCategory,'uncategorized')", f.categoryIds],
  ] as const) {
    if (values.length) {
      clauses.push(`${column} IN (${values.map(() => "?").join(",")})`);
      args.push(...values);
    }
  }
  const movement = {
    all: "1",
    in: "kind IN ('income','refund','transfer_in','topup')",
    out: "kind IN ('expense','transfer_out','bill_payment')",
    consumption: "kind IN ('expense','refund')",
    financial: "kind IN ('transfer_in','transfer_out','bill_payment','topup')",
  }[f.movement];
  clauses.push(movement);
  return { sql: clauses.join(" AND "), args };
}
export type Breakdown = {
  id: string;
  name: string;
  total: number;
  count: number;
  percent: number;
  color?: string;
  icon?: string;
};
export type Bucket = {
  date: string;
  end: string;
  expense: number;
  income: number;
  count: number;
};
export type HistoryRow = {
  id: string;
  title: string;
  amountCents: number;
  kind: string;
  localDate: string;
  institution: string;
  walletName: string;
  walletId: string;
  metricCategory: string | null;
  categoryName: string | null;
  icon: string | null;
  color: string | null;
  expense: number;
  income: number;
};
export class Analytics {
  constructor(private db: Database) {}
  private rows<T>(f: Filters, selection: string, tail = ""): T[] {
    const q = where(f);
    return this.db.getAllSync<T>(
      `${ledger} SELECT ${selection} FROM ledger LEFT JOIN categories c ON c.id=metricCategory WHERE ${q.sql} ${tail}`,
      ...q.args,
    );
  }
  getExpensesByCategory(f: Filters): Breakdown[] {
    const rows = this.rows<Breakdown>(
      f,
      "coalesce(metricCategory,'uncategorized') id,coalesce(c.name,'Sem categoria') name,coalesce(c.color,'slate') color,coalesce(c.icon,'other') icon,sum(expense) total,sum(CASE WHEN kind='expense' THEN 1 ELSE 0 END) count",
      "AND expense<>0 GROUP BY metricCategory ORDER BY total DESC",
    );
    const positive = rows.reduce((sum, x) => sum + Math.max(0, x.total), 0);
    return rows.map((x) => ({
      ...x,
      percent: positive ? (Math.max(0, x.total) / positive) * 100 : 0,
    }));
  }
  getSpendingByInstitution(f: Filters): Breakdown[] {
    const rows = this.rows<Breakdown>(
      f,
      "institution id,institution name,sum(expense) total,sum(CASE WHEN kind='expense' THEN 1 ELSE 0 END) count",
      "AND expense<>0 GROUP BY institution ORDER BY total DESC",
    );
    const total = rows.reduce((s, x) => s + Math.max(0, x.total), 0);
    return rows.map((x) => ({
      ...x,
      percent: total ? (Math.max(0, x.total) / total) * 100 : 0,
    }));
  }
  getSpendingByMerchant(f: Filters): Breakdown[] {
    return this.rows<Breakdown>(
      f,
      "title id,title name,sum(expense) total,count(*) count",
      "AND expense<>0 GROUP BY title ORDER BY total DESC LIMIT 20",
    );
  }
  getFinancialSummary(f: Filters) {
    const aggregate = (filter: Filters) =>
      this.rows<{
        expenses: number;
        income: number;
        count: number;
        purchases: number;
        benefits: number;
        cards: number;
      }>(
        filter,
        `coalesce(sum(expense),0) expenses,coalesce(sum(income),0) income,count(*) count,
       coalesce(sum(CASE WHEN kind='expense' THEN 1 ELSE 0 END),0) purchases,
       coalesce(sum(CASE WHEN walletKind IN ('food','meal','benefit') THEN expense ELSE 0 END),0) benefits,
       coalesce(sum(CASE WHEN walletKind='credit' THEN expense ELSE 0 END),0) cards`,
      )[0]!;
    const current = aggregate(f);
    const previous = aggregate({ ...f, ...previousRange(f) });
    return {
      ...current,
      result: current.income - current.expenses,
      average: current.purchases
        ? Math.round(current.expenses / current.purchases)
        : null,
      previous,
      change: percentChange(current.expenses, previous.expenses),
      largest: this.getExpensesByCategory(f).find((c) => c.total > 0) ?? null,
    };
  }
  getAverageExpense(f: Filters) {
    return this.getFinancialSummary(f).average;
  }
  getMonthlySpendingTrend(
    f: Filters,
    grouping: "day" | "week" | "month" = "day",
  ): Bucket[] {
    const rows = this.rows<{
      date: string;
      expense: number;
      income: number;
      count: number;
    }>(
      f,
      "localDate date,sum(expense) expense,sum(income) income,count(*) count",
      "GROUP BY localDate ORDER BY localDate",
    );
    const daily = new Map(rows.map((r) => [r.date, r]));
    const buckets = new Map<string, Bucket>();
    for (let date = f.start; date <= f.end; date = addDays(date, 1)) {
      const key =
        grouping === "month"
          ? `${date.slice(0, 7)}-01`
          : grouping === "week"
            ? addDays(f.start, Math.floor(daysBetween(f.start, date) / 7) * 7)
            : date;
      const bucket = buckets.get(key) ?? {
        date: key < f.start ? f.start : key,
        end: date,
        expense: 0,
        income: 0,
        count: 0,
      };
      const row = daily.get(date);
      bucket.end = date;
      bucket.expense += row?.expense ?? 0;
      bucket.income += row?.income ?? 0;
      bucket.count += row?.count ?? 0;
      buckets.set(key, bucket);
    }
    // Zero means no recorded activity, not proof that the bank's data is complete.
    return [...buckets.values()];
  }
  getIncomeVsExpenses(
    f: Filters,
    grouping: "day" | "week" | "month" = "month",
  ) {
    return this.getMonthlySpendingTrend(f, grouping).map((b) => ({
      ...b,
      difference: b.income - b.expense,
    }));
  }
  getMonthlyComparison(f: Filters) {
    const buckets = this.getMonthlySpendingTrend(f, "month");
    return buckets.map((b) => {
      const previousEnd = addDays(`${b.date.slice(0, 7)}-01`, -1);
      const previousFirst = `${previousEnd.slice(0, 7)}-01`;
      const maxDay = Number(previousEnd.slice(-2));
      const prior = this.rows<{ total: number }>(
        {
          ...f,
          start: addDays(
            previousFirst,
            Math.min(Number(b.date.slice(-2)), maxDay) - 1,
          ),
          end: addDays(
            previousFirst,
            Math.min(Number(b.end.slice(-2)), maxDay) - 1,
          ),
        },
        "coalesce(sum(expense),0) total",
      )[0]!.total;
      return {
        ...b,
        partial:
          b.date.slice(-2) !== "01" || addDays(b.end, 1).slice(-2) !== "01",
        change: percentChange(b.expense, prior),
      };
    });
  }
  history(f: Filters, limit = 100, offset = 0): HistoryRow[] {
    return this.rows<HistoryRow>(
      f,
      "ledger.id,title,amountCents,kind,localDate,institution,walletName,walletId,metricCategory,c.name categoryName,c.icon,c.color,expense,income",
      `ORDER BY localDate DESC,occurredAt DESC,ledger.id LIMIT ${Math.min(200, Math.max(1, Math.floor(limit)))} OFFSET ${Math.max(0, Math.floor(offset))}`,
    );
  }
  walletBalances(asOf: string) {
    return this.db.getAllSync<Wallet & { balance: number | null }>(
      `${ledger} SELECT w.*,CASE WHEN w.openingCents IS NULL OR w.openingDate>? THEN NULL ELSE w.openingCents + coalesce((SELECT sum(cash) FROM ledger WHERE walletId=w.id AND localDate BETWEEN w.openingDate AND ?),0) END balance FROM wallets w`,
      asOf,
      asOf,
    );
  }
  getBenefitsUsage(f: Filters) {
    const wallets = this.walletBalances(f.end).filter(
      (w) =>
        ["food", "meal", "benefit"].includes(w.kind) &&
        (!f.walletIds.length || f.walletIds.includes(w.id)) &&
        (!f.institutions.length || f.institutions.includes(w.institution)) &&
        (!f.walletKinds.length || f.walletKinds.includes(w.kind)),
    );
    return wallets.map((w) => {
      const usage = this.rows<{ used: number }>(
        { ...f, walletIds: [w.id] },
        "coalesce(sum(expense),0) used",
      )[0]!.used;
      const base = this.db.getFirstSync<{
        adjustments: number;
        topups: number;
      }>(
        `${ledger} SELECT coalesce(sum(CASE WHEN localDate<? OR (localDate>=? AND kind NOT IN ('expense','refund')) THEN cash ELSE 0 END),0) adjustments,coalesce(sum(CASE WHEN kind='topup' AND localDate>=? THEN amountCents ELSE 0 END),0) topups FROM ledger WHERE walletId=? AND localDate BETWEEN ? AND ?`,
        f.start,
        f.start,
        f.start,
        w.id,
        w.openingDate,
        f.end,
      )!;
      const reference =
        w.openingCents !== null && w.openingDate <= f.start
          ? w.openingCents + base.adjustments
          : null;
      const comparable =
        !f.categoryIds.length && ["all", "consumption"].includes(f.movement);
      return {
        ...w,
        used: usage,
        reference,
        topups: base.topups,
        remaining: w.balance,
        percent:
          comparable && reference !== null && reference > 0
            ? (usage / reference) * 100
            : null,
        estimated: true,
      };
    });
  }
  dashboard(f: Filters) {
    return {
      summary: this.getFinancialSummary(f),
      categories: this.getExpensesByCategory(f),
      institutions: this.getSpendingByInstitution(f),
      benefits: this.getBenefitsUsage(f),
      history: this.history(f, 5),
    };
  }
}
