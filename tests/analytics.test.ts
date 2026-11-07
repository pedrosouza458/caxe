import { test } from "node:test";
import assert from "node:assert/strict";
import { fixture, filter, wallet, tx } from "./helpers.ts";
import {
  localDate,
  periodRange,
  previousRange,
  percentChange,
  parseMoney,
  dateSchema,
} from "../src/domain/model.ts";

test("SQLite: despesas, receitas, resultado e ticket médio conferem com o histórico", () => {
  const { repo, analytics } = fixture();
  repo.saveWallet(wallet());
  repo.saveTransaction(tx({ amountCents: 8290 }));
  repo.saveTransaction(tx({ amountCents: 2010, categoryId: "transport" }));
  repo.saveTransaction(
    tx({ kind: "income", amountCents: 20000, categoryId: "income" }),
  );
  const s = analytics.getFinancialSummary(filter);
  assert.equal(s.expenses, 10300);
  assert.equal(s.income, 20000);
  assert.equal(s.result, 9700);
  assert.equal(s.average, 5150);
  assert.equal(s.count, 3);
  const history = analytics.history(filter);
  assert.equal(
    history.reduce((s, t) => s + t.expense, 0),
    s.expenses,
  );
  assert.equal(
    history.reduce((s, t) => s + t.income, 0),
    s.income,
  );
  const cats = analytics.getExpensesByCategory(filter);
  assert.equal(cats.length, 2);
  assert.equal(cats[0]!.total, 8290);
  assert.equal(
    cats.reduce((s, c) => s + c.percent, 0),
    100,
  );
  assert.equal(
    analytics.getSpendingByInstitution(filter)[0]!.total,
    s.expenses,
  );
});
test("filtros combinam período, instituição, carteira, tipo, categoria e movimentação", () => {
  const { repo, analytics } = fixture();
  repo.saveWallet(wallet());
  repo.saveWallet(
    wallet({ id: "benefit", institution: "Pluxee", kind: "food" }),
  );
  repo.saveTransaction(tx());
  repo.saveTransaction(tx({ walletId: "benefit", amountCents: 8290 }));
  repo.saveTransaction(tx({ walletId: "benefit", categoryId: "restaurant" }));
  repo.saveTransaction(tx({ walletId: "benefit", localDate: "2026-10-30" }));
  const f = {
    ...filter,
    institutions: ["Pluxee"],
    walletIds: ["benefit"],
    walletKinds: ["food" as const],
    categoryIds: ["market"],
    movement: "consumption" as const,
  };
  assert.equal(analytics.getFinancialSummary(f).expenses, 8290);
  assert.equal(analytics.history(f).length, 1);
  assert.equal(
    analytics.getFinancialSummary({ ...f, institutions: ["Itaú"] }).count,
    0,
  );
});
test("estorno reduz a compra na data do crédito e herda a categoria original", () => {
  const { repo, analytics } = fixture();
  repo.saveWallet(wallet());
  const purchase = tx({ amountCents: 5000 });
  repo.saveTransaction(purchase);
  repo.saveTransaction(
    tx({
      kind: "refund",
      amountCents: 2000,
      refundOf: purchase.id,
      categoryId: "other",
      localDate: "2026-11-06",
    }),
  );
  const s = analytics.getFinancialSummary(filter);
  assert.equal(s.expenses, 3000);
  assert.equal(s.income, 0);
  assert.equal(s.average, 3000);
  assert.equal(analytics.getExpensesByCategory(filter)[0]!.id, "market");
  assert.equal(
    analytics.getFinancialSummary({ ...filter, end: "2026-11-05" }).expenses,
    5000,
  );
  assert.equal(analytics.walletBalances(filter.end)[0]!.balance, 97000);
});
test("estorno sem compra, excessivo, em outra carteira ou anterior é recusado", () => {
  const { repo } = fixture();
  repo.saveWallet(wallet());
  repo.saveWallet(wallet({ id: "other" }));
  const p = tx();
  repo.saveTransaction(p);
  assert.throws(() => repo.saveTransaction(tx({ kind: "refund" })));
  assert.throws(() =>
    repo.saveTransaction(
      tx({ kind: "refund", refundOf: p.id, amountCents: 1001 }),
    ),
  );
  assert.throws(() =>
    repo.saveTransaction(
      tx({ kind: "refund", refundOf: p.id, walletId: "other" }),
    ),
  );
  assert.throws(() =>
    repo.saveTransaction(
      tx({ kind: "refund", refundOf: p.id, localDate: "2026-11-01" }),
    ),
  );
  repo.saveTransaction(
    tx({ kind: "refund", refundOf: p.id, amountCents: 700 }),
  );
  assert.throws(() =>
    repo.saveTransaction(
      tx({ kind: "refund", refundOf: p.id, amountCents: 400 }),
    ),
  );
  assert.throws(() => repo.saveTransaction({ ...p, deleted: true }));
});
test("estorno de compra anterior não vira receita nem cria ticket sem compras", () => {
  const { repo, analytics } = fixture();
  repo.saveWallet(wallet());
  const p = tx({ localDate: "2026-10-30" });
  repo.saveTransaction(p);
  repo.saveTransaction(tx({ kind: "refund", refundOf: p.id }));
  const s = analytics.getFinancialSummary(filter);
  assert.equal(s.expenses, -1000);
  assert.equal(s.income, 0);
  assert.equal(s.average, null);
  assert.equal(analytics.getExpensesByCategory(filter)[0]!.percent, 0);
});
test("fatura e transferências próprias não duplicam receitas ou despesas", () => {
  const { repo, analytics } = fixture();
  repo.saveWallet(wallet());
  repo.saveWallet(wallet({ id: "credit", kind: "credit", openingCents: null }));
  repo.saveTransaction(tx({ walletId: "credit", amountCents: 5000 }));
  repo.saveTransaction(tx({ kind: "bill_payment", amountCents: 5000 }));
  repo.saveTransaction(tx({ kind: "transfer_out", amountCents: 3000 }));
  repo.saveTransaction(tx({ kind: "transfer_in", amountCents: 3000 }));
  const s = analytics.getFinancialSummary(filter);
  assert.equal(s.expenses, 5000);
  assert.equal(s.cards, 5000);
  assert.equal(s.income, 0);
  assert.equal(
    analytics.getFinancialSummary({ ...filter, movement: "financial" })
      .expenses,
    0,
  );
  assert.equal(analytics.getIncomeVsExpenses(filter)[0]!.expense, 5000);
});
test("evento duplicado e conciliação entre fontes não contam duas vezes", () => {
  const { repo, analytics } = fixture();
  repo.saveWallet(wallet());
  const p = tx({ sourceKey: "notification-1" });
  repo.saveTransaction(p);
  repo.saveTransaction(tx({ sourceKey: "notification-1" }));
  repo.saveTransaction(tx({ sourceKey: "notification-2", duplicateOf: p.id }));
  assert.equal(analytics.getFinancialSummary(filter).expenses, 1000);
  assert.equal(analytics.history(filter).length, 1);
  assert.equal(
    repo.pending().filter((p) => p.entity === "transaction").length,
    2,
  );
});
test("valores coincidentes sugerem revisão sem fundir compras distintas automaticamente", () => {
  const { repo, analytics } = fixture();
  repo.saveWallet(wallet());
  const original = tx({ title: "Notificação A" });
  repo.saveTransaction(original);
  const other = tx({ title: "Notificação B" });
  assert.equal(repo.duplicateCandidates(other)[0]!.id, original.id);
  assert.equal(
    repo.duplicateCandidates({ ...other, amountCents: 1234 }).length,
    0,
  );
  repo.saveTransaction(other);
  assert.equal(analytics.getFinancialSummary(filter).expenses, 2000);
  repo.saveTransaction({ ...other, duplicateOf: original.id });
  assert.equal(analytics.getFinancialSummary(filter).expenses, 1000);
});
test("pendentes e excluídas ficam fora das métricas; confirmação aplica uma vez", () => {
  const { repo, analytics } = fixture();
  repo.saveWallet(wallet());
  const p = tx({ status: "pending" });
  repo.saveTransaction(p);
  repo.saveTransaction(tx({ deleted: true }));
  assert.equal(analytics.getFinancialSummary(filter).expenses, 0);
  repo.saveTransaction({ ...p, status: "confirmed" });
  assert.equal(analytics.getFinancialSummary(filter).expenses, 1000);
});
test("mês vazio gera totais zero e dados vazios, sem gráficos artificiais", () => {
  const { analytics } = fixture();
  const s = analytics.getFinancialSummary(filter);
  assert.equal(s.count, 0);
  assert.equal(s.expenses, 0);
  assert.equal(s.average, null);
  assert.equal(s.change, null);
  assert.deepEqual(analytics.getExpensesByCategory(filter), []);
  assert.equal(
    analytics.getMonthlySpendingTrend(filter).every((d) => d.count === 0),
    true,
  );
});
test("agrupamentos diário, semanal e mensal preservam exatamente os totais", () => {
  const { repo, analytics } = fixture();
  repo.saveWallet(wallet());
  for (let i = 1; i <= 20; i++)
    repo.saveTransaction(
      tx({
        localDate: `2026-11-${String(i).padStart(2, "0")}`,
        amountCents: i * 17,
      }),
    );
  const f = { ...filter, end: "2026-11-30" };
  for (const group of ["day", "week", "month"] as const)
    assert.equal(
      analytics
        .getMonthlySpendingTrend(f, group)
        .reduce((s, x) => s + x.expense, 0),
      analytics.getFinancialSummary(f).expenses,
    );
  assert.equal(analytics.getMonthlySpendingTrend(f)[25]!.count, 0);
});
test("mês parcial compara os mesmos dias do mês anterior", () => {
  const { repo, analytics } = fixture();
  repo.saveWallet(wallet());
  repo.saveTransaction(tx({ amountCents: 2000 }));
  repo.saveTransaction(tx({ amountCents: 1000, localDate: "2026-10-03" }));
  repo.saveTransaction(tx({ amountCents: 90000, localDate: "2026-10-20" }));
  const s = analytics.getFinancialSummary(filter);
  assert.equal(s.previous.expenses, 1000);
  assert.equal(s.change, 100);
  const months = analytics.getMonthlyComparison(filter);
  assert.equal(months[0]!.partial, true);
  assert.equal(months[0]!.change, 100);
  assert.equal(
    analytics.getMonthlyComparison({ ...filter, start: "2026-11-03" })[0]!
      .change,
    100,
  );
  assert.deepEqual(previousRange({ start: "2026-03-01", end: "2026-03-31" }), {
    start: "2026-02-01",
    end: "2026-02-28",
  });
  assert.equal(percentChange(100, 0), null);
});
test("benefícios separados: referência, recarga, consumido, restante e percentual", () => {
  const { repo, analytics } = fixture();
  repo.saveWallet(
    wallet({
      id: "food",
      institution: "Pluxee",
      name: "Alimentação",
      kind: "food",
      openingCents: 30000,
    }),
  );
  repo.saveWallet(
    wallet({
      id: "meal",
      institution: "Raiô",
      name: "Refeição",
      kind: "meal",
      openingCents: 50000,
    }),
  );
  repo.saveTransaction(
    tx({ walletId: "food", kind: "topup", amountCents: 50000 }),
  );
  repo.saveTransaction(tx({ walletId: "food", amountCents: 52000 }));
  repo.saveTransaction(tx({ walletId: "meal", amountCents: 34000 }));
  const benefits = analytics.getBenefitsUsage(filter);
  const food = benefits.find((b) => b.id === "food")!;
  const meal = benefits.find((b) => b.id === "meal")!;
  assert.equal(food.reference, 80000);
  assert.equal(food.used, 52000);
  assert.equal(food.remaining, 28000);
  assert.equal(food.percent, 65);
  assert.equal(food.estimated, true);
  assert.equal(meal.remaining, 16000);
  assert.equal(meal.percent, 68);
  assert.equal(analytics.getFinancialSummary(filter).income, 0);
});
test("referência incompleta ou zero não produz percentual; filtros não inventam denominador", () => {
  const { repo, analytics } = fixture();
  repo.saveWallet(wallet({ id: "food", kind: "food", openingCents: null }));
  repo.saveWallet(wallet({ id: "meal", kind: "meal", openingCents: 0 }));
  repo.saveTransaction(tx({ walletId: "food" }));
  for (const b of analytics.getBenefitsUsage(filter))
    assert.equal(b.percent, null);
  repo.saveWallet(wallet({ id: "food", kind: "food", openingCents: 80000 }));
  assert.equal(
    analytics
      .getBenefitsUsage({ ...filter, categoryIds: ["market"] })
      .find((w) => w.id === "food")!.percent,
    null,
  );
  assert.equal(analytics.walletBalances("2026-10-01")[0]!.balance, null);
});
test("categoria ausente usa agrupamento neutro e é filtrável no histórico", () => {
  const { repo, analytics } = fixture();
  repo.saveWallet(wallet());
  repo.saveTransaction(tx({ categoryId: null }));
  assert.equal(analytics.getExpensesByCategory(filter)[0]!.id, "uncategorized");
  assert.equal(
    analytics.history({ ...filter, categoryIds: ["uncategorized"] }).length,
    1,
  );
});
test("datas e fuso: meia-noite UTC, virada de ano e ano bissexto", () => {
  assert.equal(localDate("2026-11-01T01:00:00Z"), "2026-10-31");
  assert.equal(localDate("2026-11-01T03:00:00Z"), "2026-11-01");
  assert.equal(localDate("2026-01-01T00:00:00Z"), "2025-12-31");
  assert.deepEqual(periodRange("7d", "2026-01-03"), {
    start: "2025-12-28",
    end: "2026-01-03",
  });
  assert.deepEqual(periodRange("previous", "2024-03-07"), {
    start: "2024-02-01",
    end: "2024-02-29",
  });
  assert.equal(dateSchema.safeParse("2026-02-30").success, false);
  assert.equal(parseMoney("82,90"), 8290);
  assert.equal(parseMoney("0,29"), 29);
  assert.throws(() => parseMoney("1.000,00"));
});
