import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fixture, wallet, tx, filter } from "./helpers.ts";
import { iconDescriptor } from "../src/domain/icons.ts";
import { themes, categoryColor } from "../src/ui/theme.ts";
import { synchronize } from "../src/data/sync.ts";
import { parseNotification } from "../src/domain/capture.ts";

test("preferência padrão e alternância imediata logo → categoria → logo, offline", () => {
  const { repo } = fixture();
  assert.equal(repo.preferences().iconMode, "institution");
  repo.savePreferences({ ...repo.preferences(), iconMode: "category" });
  assert.equal(
    iconDescriptor(
      repo.preferences().iconMode,
      "Nubank",
      { icon: "cart", color: "lime" },
      ["nubank"],
    ).type,
    "category",
  );
  repo.savePreferences({ ...repo.preferences(), iconMode: "institution" });
  assert.equal(
    iconDescriptor(repo.preferences().iconMode, "Nubank", null, ["nubank"])
      .type,
    "logo",
  );
  assert.equal(repo.pending().length, 1);
});
test("SQLite em disco restaura preferência e filtros após fechar e reiniciar", () => {
  const dir = mkdtempSync(join(tmpdir(), "caxe-"));
  try {
    const path = join(dir, "test.db");
    const first = fixture(path);
    first.repo.savePreferences({
      ...first.repo.preferences(),
      iconMode: "category",
      theme: "light",
      hidden: true,
      filters: filter,
    });
    first.sqlite.close();
    const second = fixture(path);
    assert.equal(second.repo.preferences().iconMode, "category");
    assert.equal(second.repo.preferences().theme, "light");
    assert.deepEqual(second.repo.preferences().filters, filter);
    assert.equal(second.repo.pending().length, 1);
    second.sqlite.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test("sincronização restaura preferência remota, preserva mudança local pendente e tenta novamente", async () => {
  const { repo } = fixture();
  repo.receive([
    {
      entity: "preferences",
      entityId: "main",
      version: 1,
      payload: { iconMode: "category", theme: "dark", hidden: false },
    },
  ]);
  assert.equal(repo.preferences().iconMode, "category");
  repo.savePreferences({ ...repo.preferences(), iconMode: "institution" });
  repo.receive([
    {
      entity: "preferences",
      entityId: "main",
      version: 2,
      payload: { iconMode: "category", theme: "light", hidden: false },
    },
  ]);
  assert.equal(repo.preferences().iconMode, "institution");
  assert.equal(repo.pending()[0]!.expectedVersion, 2);
  assert.equal(repo.conflicts().length, 0);
  await synchronize(repo, async () => ({
    records: [],
    acknowledged: [repo.pending()[0]!.opId],
    conflicts: [],
    next: null,
  }));
  assert.equal(repo.pending().length, 0);
});
test("logo ausente ou inválida usa iniciais; categoria desconhecida usa ícone neutro", () => {
  assert.deepEqual(iconDescriptor("institution", "Banco Teste", null, []), {
    type: "initials",
    text: "BT",
  });
  assert.equal(
    iconDescriptor("institution", "Nubank", null, ["nubank"], true).type,
    "initials",
  );
  assert.deepEqual(
    iconDescriptor(
      "category",
      "Nubank",
      { icon: "unknown", color: "unknown" },
      ["nubank"],
    ),
    { type: "category", icon: "other", color: "slate" },
  );
  assert.deepEqual(iconDescriptor("category", "X", null, []), {
    type: "category",
    icon: "other",
    color: "slate",
  });
});
test("categoria personalizada persiste ícone e cor em Dark e Light", () => {
  const { repo } = fixture();
  repo.saveCategory({
    id: "pets",
    name: "Animais",
    icon: "heart",
    color: "rose",
  });
  const c = repo.categories().find((c) => c.id === "pets")!;
  assert.equal(iconDescriptor("category", "Banco", c, []).type, "category");
  assert.notEqual(
    categoryColor(c.color, themes.dark),
    categoryColor(c.color, themes.light),
  );
  assert.notEqual(categoryColor(c.color, themes.dark), themes.dark.surface);
  assert.notEqual(categoryColor(c.color, themes.light), themes.light.surface);
});
test("falha de rede preserva fila e totais; sincronizar não duplica operações pendentes", async () => {
  const { repo, analytics } = fixture();
  repo.saveWallet(wallet());
  const t = tx();
  repo.saveTransaction(t);
  const pending = repo.pending();
  await assert.rejects(
    synchronize(repo, async () => {
      throw Error("offline");
    }),
  );
  assert.equal(repo.pending().length, 2);
  assert.equal(analytics.getFinancialSummary(filter).expenses, 1000);
  await synchronize(repo, async () => ({
    records: [
      { entity: "wallet", entityId: "bank", payload: wallet(), version: 1 },
      { entity: "transaction", entityId: t.id, payload: t, version: 1 },
    ],
    acknowledged: pending.map((p) => p.opId),
    conflicts: [],
    next: null,
  }));
  assert.equal(repo.pending().length, 0);
  assert.equal(analytics.getFinancialSummary(filter).expenses, 1000);
});
test("edição durante request não é apagada por um reconhecimento antigo", async () => {
  const { repo } = fixture();
  repo.savePreferences({ ...repo.preferences(), iconMode: "category" });
  const old = repo.pending()[0]!;
  let calls = 0;
  await synchronize(repo, async () => {
    if (++calls > 1)
      return {
        records: [],
        acknowledged: repo.pending().map((op) => op.opId),
        conflicts: [],
        next: null,
      };
    repo.savePreferences({ ...repo.preferences(), iconMode: "institution" });
    return {
      records: [
        {
          entity: "preferences",
          entityId: "main",
          version: 1,
          payload: old.payload,
        },
      ],
      acknowledged: [old.opId],
      conflicts: [],
      next: null,
    };
  });
  assert.equal(repo.preferences().iconMode, "institution");
  assert.equal(repo.pending().length, 0);
  assert.equal(calls, 2);
});
test("conflito financeiro exige escolha e mantém operações locais até revisão", () => {
  const { repo, analytics } = fixture();
  repo.saveWallet(wallet());
  const t = tx();
  repo.saveTransaction(t);
  repo.receive([
    {
      entity: "transaction",
      entityId: t.id,
      version: 2,
      payload: { ...t, amountCents: 2000 },
    },
  ]);
  assert.equal(analytics.getFinancialSummary(filter).expenses, 1000);
  assert.equal(repo.conflicts().length, 1);
  repo.resolveConflict("transaction", t.id, "local");
  assert.equal(
    repo.pending().find((p) => p.entity === "transaction")!.expectedVersion,
    2,
  );
  assert.equal(repo.conflicts().length, 0);
  repo.receive([
    {
      entity: "transaction",
      entityId: t.id,
      version: 3,
      payload: { ...t, amountCents: 2000 },
    },
  ]);
  repo.resolveConflict("transaction", t.id, "remote");
  assert.equal(analytics.getFinancialSummary(filter).expenses, 2000);
  assert.equal(
    repo.pending().filter((p) => p.entity === "transaction").length,
    0,
  );
});
test("paginação recebe carteiras antes de transações e continua offline após importar", async () => {
  const { repo, analytics } = fixture();
  const t = tx();
  let page = 0;
  await synchronize(repo, async () =>
    ++page === 1
      ? {
          records: [
            {
              entity: "wallet",
              entityId: "bank",
              payload: wallet(),
              version: 1,
            },
          ],
          acknowledged: [],
          conflicts: [],
          next: "page2",
        }
      : {
          records: [
            { entity: "transaction", entityId: t.id, payload: t, version: 1 },
          ],
          acknowledged: [],
          conflicts: [],
          next: null,
        },
  );
  assert.equal(page, 2);
  assert.equal(analytics.getFinancialSummary(filter).expenses, 1000);
});
test("captura sugere valor mas exige revisão; mensagens ambíguas não inventam números", () => {
  assert.equal(
    parseNotification("Compra aprovada R$ 82,90 em Mercado")?.amountCents,
    8290,
  );
  assert.equal(parseNotification("Compra R$ 82,90 · saldo R$ 900,00"), null);
  assert.equal(parseNotification("Texto sem valor"), null);
  assert.equal(parseNotification("Seu limite: R$ 100,00")?.kind, null);
  assert.equal(parseNotification("Compra R$ 82,90")?.needsReview, true);
});
test("evento idêntico recebido com outro ID mantém um único original consultável", () => {
  const { repo, analytics } = fixture();
  repo.saveWallet(wallet());
  const local = tx({ id: "local", sourceKey: "same-source" });
  repo.saveTransaction(local);
  const remote = { ...local, id: "remote" };
  repo.receive([
    { entity: "transaction", entityId: "remote", payload: remote, version: 1 },
  ]);
  repo.receive(
    [
      {
        entity: "transaction",
        entityId: "local",
        payload: { ...local, sourceKey: null, duplicateOf: "remote" },
        version: 1,
      },
    ],
    repo
      .pending()
      .filter((p) => p.entity === "transaction")
      .map((p) => p.opId),
  );
  assert.equal(analytics.getFinancialSummary(filter).expenses, 1000);
  assert.equal(analytics.history(filter)[0]!.id, "remote");
});
test("snapshot remoto inalterado não cria conflito para edições locais pendentes", () => {
  const { repo } = fixture();
  repo.saveWallet(wallet());
  const t = tx();
  repo.saveTransaction(t);
  repo.receive(
    [{ entity: "transaction", entityId: t.id, payload: t, version: 1 }],
    repo
      .pending()
      .filter((op) => op.entity === "transaction")
      .map((op) => op.opId),
  );
  repo.saveTransaction({ ...t, amountCents: 2000 });
  repo.receive([
    { entity: "transaction", entityId: t.id, payload: t, version: 1 },
  ]);
  assert.equal(repo.conflicts().length, 0);
  assert.equal(
    repo.pending().find((op) => op.entity === "transaction")!.expectedVersion,
    1,
  );
});
test("edição financeira durante request é rebaseada sobre seu próprio reconhecimento", async () => {
  const { repo, analytics } = fixture();
  repo.saveWallet(wallet());
  const t = tx();
  repo.saveTransaction(t);
  const submitted = repo.pending();
  let calls = 0;
  await synchronize(repo, async () => {
    if (++calls > 1) {
      assert.equal(repo.pending()[0]!.expectedVersion, 1);
      return {
        records: [],
        acknowledged: repo.pending().map((op) => op.opId),
        conflicts: [],
        next: null,
      };
    }
    repo.saveTransaction({ ...t, amountCents: 2000 });
    return {
      records: [
        { entity: "transaction", entityId: t.id, payload: t, version: 1 },
      ],
      acknowledged: submitted.map((op) => op.opId),
      conflicts: [],
      next: null,
    };
  });
  assert.equal(repo.conflicts().length, 0);
  assert.equal(analytics.getFinancialSummary(filter).expenses, 2000);
  assert.equal(repo.pending().length, 0);
  assert.equal(calls, 2);
});
