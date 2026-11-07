import { useMemo, useState, useEffect } from "react";
import {
  View,
  Pressable,
  Alert,
  Platform,
  AppState,
  ScrollView,
} from "react-native";
import { Image } from "expo-image";
import { Eye, EyeOff } from "lucide-react-native";
import { useStore, uid } from "./store";
import {
  Action,
  Label,
  Card,
  MetricCard,
  ChartEmptyState,
  ChartCard,
  Field,
  TransactionRow,
  TransactionIcon,
  s,
} from "./components";
import {
  ExpenseDonutChart,
  SpendingTrendChart,
  IncomeExpenseChart,
  InstitutionSpendingChart,
  BenefitsUsageChart,
  MonthlyComparisonChart,
} from "./charts";
import { FiltersPanel, periods } from "./Filters";
import { walletLabels, kindLabels } from "./Forms";
import type { CaptureDraft } from "./Forms";
import { money, percentage, periodRange } from "../domain/model";
import type { Transaction } from "../domain/model";
import { apiURL, auth } from "../data/auth";
import { notificationModule, drainNotifications } from "../data/notifications";

export type Screen =
  | {
      name:
        | "home"
        | "history"
        | "wallets"
        | "settings"
        | "analysis"
        | "newWallet"
        | "newTransaction"
        | "newCategory"
        | "capture"
        | "account";
    }
  | { name: "wallet"; id: string }
  | { name: "transaction"; id: string }
  | { name: "editTransaction"; transaction: Transaction }
  | { name: "review"; capture: CaptureDraft };
export type Navigate = (screen: Screen) => void;
export function Heading({
  title,
  subtitle,
  onBack,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
}) {
  return (
    <View style={{ gap: 8 }}>
      {onBack && <Action secondary title="‹ Voltar" onPress={onBack} />}
      <Label style={s.title} accessibilityRole="header">
        {title}
      </Label>
      {subtitle && (
        <Label muted size={12}>
          {subtitle}
        </Label>
      )}
    </View>
  );
}
export function Home({ navigate }: { navigate: Navigate }) {
  const {
    analytics,
    filters,
    setFilters,
    revision,
    prefs,
    theme,
    updatePreferences,
    today,
    repository,
  } = useStore();
  const current = { ...filters, ...periodRange("month", today) };
  const data = useMemo(
    () => analytics.dashboard(current),
    [analytics, revision, JSON.stringify(current)],
  );
  const balances = useMemo(
    () => analytics.walletBalances(today),
    [analytics, revision, today],
  );
  const banks = balances.filter((w) => w.kind === "account");
  const bankBalance = banks.some((w) => w.balance === null)
    ? null
    : banks.reduce((sum, w) => sum + (w.balance ?? 0), 0);
  return (
    <>
      <View style={s.row}>
        <View style={{ flexDirection: "row", alignItems: "baseline", gap: 1 }}>
          <Label size={28} bold>
            caxe
          </Label>
          <Image
            source={require("../../assets/figma/dot.svg")}
            style={{ width: 6, height: 6 }}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            prefs.hidden ? "Mostrar valores" : "Ocultar valores"
          }
          onPress={() => updatePreferences({ hidden: !prefs.hidden })}
          style={{
            padding: 12,
            borderRadius: 24,
            backgroundColor: theme.surface2,
          }}
        >
          {prefs.hidden ? (
            <EyeOff color={theme.limeText} size={20} />
          ) : (
            <Eye color={theme.limeText} size={20} />
          )}
        </Pressable>
      </View>
      <View style={{ gap: 8 }}>
        <Label muted size={10} bold>
          SEU RESUMO
        </Label>
        <Heading title="Tudo sob controle." />
      </View>
      <View
        style={{
          minHeight: 194,
          borderRadius: 23,
          padding: 20,
          backgroundColor: theme.lime,
          gap: 14,
          overflow: "hidden",
        }}
      >
        <Image
          source={require("../../assets/figma/citrus.svg")}
          style={{
            position: "absolute",
            right: -55,
            top: -34,
            width: 140,
            height: 140,
          }}
        />
        <Image
          source={require("../../assets/figma/citrus-hole.svg")}
          style={{
            position: "absolute",
            right: -4,
            top: 0,
            width: 75,
            height: 75,
          }}
        />
        <Label bold size={11} style={{ color: theme.onAccent }}>
          SALDO BANCÁRIO ACOMPANHADO
        </Label>
        <Label size={33} bold style={{ color: theme.onAccent }}>
          {bankBalance === null
            ? "Referência incompleta"
            : money(bankBalance, prefs.hidden)}
        </Label>
        <Label size={12} style={{ color: theme.onAccent }}>
          Estimado a partir dos seus registros
        </Label>
        <View style={s.row}>
          <Label size={11} bold style={{ color: theme.onAccent }}>
            Benefícios e limite de crédito ficam separados
          </Label>
          <Image
            source={require("../../assets/figma/arrow.svg")}
            style={{ width: 22, height: 22 }}
          />
        </View>
      </View>
      <View style={s.wrap}>
        <Card style={{ width: "48%", minHeight: 113 }}>
          <Image
            source={
              theme.mode === "dark"
                ? require("../../assets/figma/summary-wallet-dark.svg")
                : require("../../assets/figma/summary-wallet-light.svg")
            }
            style={{ width: 19, height: 19 }}
          />
          <Label muted size={11}>
            Gastos do mês
          </Label>
          <Label bold size={18}>
            {money(data.summary.expenses, prefs.hidden)}
          </Label>
        </Card>
        <Card style={{ width: "48%", minHeight: 113 }}>
          <Image
            source={
              theme.mode === "dark"
                ? require("../../assets/figma/summary-spark-dark.svg")
                : require("../../assets/figma/summary-spark-light.svg")
            }
            style={{ width: 19, height: 19 }}
          />
          <Label muted size={11}>
            Receitas do mês
          </Label>
          <Label bold size={18}>
            {money(data.summary.income, prefs.hidden)}
          </Label>
        </Card>
      </View>
      {repository.db.getFirstSync<{ count: number }>(
        "SELECT count(*) count FROM capture_inbox",
      )!.count > 0 && (
        <Action
          secondary
          title="Capturas pendentes · Revisar"
          onPress={() => navigate({ name: "capture" })}
        />
      )}
      <Action
        title="Ver análises ↗"
        onPress={() => navigate({ name: "analysis" })}
      />
      <ExpenseDonutChart
        compact
        onAll={() => navigate({ name: "analysis" })}
        data={data.categories}
        total={data.summary.expenses}
        onCategory={(id) => {
          setFilters({
            ...current,
            categoryIds: [id],
            movement: "consumption",
          });
          navigate({ name: "history" });
        }}
      />
      <View style={s.row}>
        <Label bold size={18}>
          Últimas movimentações
        </Label>
        <Action
          secondary
          title="Ver todas ↗"
          onPress={() => navigate({ name: "history" })}
        />
      </View>
      {data.history.length ? (
        data.history.map((row) => (
          <TransactionRow
            key={row.id}
            row={row}
            onPress={() => navigate({ name: "transaction", id: row.id })}
          />
        ))
      ) : (
        <ChartEmptyState />
      )}
      <Action
        secondary
        title="+ Nova movimentação"
        onPress={() => navigate({ name: "newTransaction" })}
      />
      <BenefitsUsageChart
        data={data.benefits}
        onWallet={(id) => navigate({ name: "wallet", id })}
      />
    </>
  );
}
export function Analysis({
  navigate,
  walletId,
}: {
  navigate: Navigate;
  walletId?: string;
}) {
  const { analytics, filters, setFilters, revision, prefs, today, repository } =
    useStore();
  const [group, setGroup] = useState<"day" | "week" | "month">("day");
  const [errorRevision, setErrorRevision] = useState(0);
  const f = walletId ? { ...filters, walletIds: [walletId] } : filters;
  const result = useMemo(() => {
    try {
      return {
        data: {
          summary: analytics.getFinancialSummary(f),
          categories: analytics.getExpensesByCategory(f),
          trend: analytics.getMonthlySpendingTrend(f, group),
          income: analytics.getIncomeVsExpenses(f, group),
          institutions: analytics.getSpendingByInstitution(f),
          benefits: analytics.getBenefitsUsage(f),
          months: analytics.getMonthlyComparison(f),
        },
        error: null,
      };
    } catch {
      return {
        data: null,
        error:
          "Não foi possível carregar a análise. Seus dados permanecem salvos.",
      };
    }
  }, [analytics, revision, JSON.stringify(f), group, errorRevision]);
  const drill = (change: Partial<typeof filters>) => {
    setFilters({ ...f, ...change });
    navigate({ name: "history" });
  };
  if (!result.data)
    return (
      <ChartCard
        title="Análise financeira"
        error={result.error ?? "Erro local"}
        onRetry={() => setErrorRevision((x) => x + 1)}
      />
    );
  const d = result.data;
  const summary = d.summary;
  return (
    <>
      <Heading
        title={walletId ? "Análise da carteira" : "Análise financeira"}
        subtitle="Seus hábitos, com mais clareza. Dados processados neste aparelho."
      />
      <FiltersPanel fixedWalletId={walletId} />
      <View style={s.wrap}>
        {[
          ["Total gasto", money(summary.expenses, prefs.hidden)],
          ["Total recebido", money(summary.income, prefs.hidden)],
          ["Resultado", money(summary.result, prefs.hidden)],
          ["Maior categoria", summary.largest?.name ?? "Sem dados"],
          ["Transações", String(summary.count)],
          [
            "Ticket médio",
            summary.average === null
              ? "Sem compras"
              : money(summary.average, prefs.hidden),
          ],
          [
            "Variação",
            prefs.hidden
              ? "••••"
              : summary.change === null
                ? "Sem base anterior"
                : `${summary.change > 0 ? "+" : ""}${percentage(summary.change)}`,
          ],
          ["Em benefícios", money(summary.benefits, prefs.hidden)],
          ["Em cartões bancários", money(summary.cards, prefs.hidden)],
        ].map(([label, value]) => (
          <MetricCard
            key={label}
            label={label!}
            value={value!}
            detail={
              label === "Variação"
                ? "Mesmo número de dias no período anterior"
                : undefined
            }
          />
        ))}
      </View>
      <Card>
        <Label muted size={12}>
          Período anterior equivalente
        </Label>
        <Label>
          Receitas {money(summary.previous.income, prefs.hidden)} · Despesas{" "}
          {money(summary.previous.expenses, prefs.hidden)}
        </Label>
        <Label muted size={11}>
          Resultado{" "}
          {money(
            summary.previous.income - summary.previous.expenses,
            prefs.hidden,
          )}
          . Os saldos completos não são alterados por filtros de categoria.
        </Label>
      </Card>
      <ExpenseDonutChart
        data={d.categories}
        total={summary.expenses}
        onCategory={(id) =>
          drill({ categoryIds: [id], movement: "consumption" })
        }
      />
      <Label bold>Evolução · intervalo</Label>
      <View style={s.wrap}>
        {periods
          .filter(([key]) => ["7d", "30d", "3m", "6m", "12m"].includes(key))
          .map(([key, title]) => (
            <Action
              key={key}
              secondary
              title={title}
              onPress={() =>
                setFilters({ ...filters, ...periodRange(key, today) })
              }
            />
          ))}
      </View>
      <View style={s.wrap}>
        {(["day", "week", "month"] as const).map((x) => (
          <Action
            secondary
            key={x}
            title={{ day: "Diário", week: "Semanal", month: "Mensal" }[x]}
            selected={group === x}
            onPress={() => setGroup(x)}
          />
        ))}
      </View>
      <SpendingTrendChart
        data={d.trend}
        onPeriod={(start, end) => drill({ start, end })}
      />
      <IncomeExpenseChart data={d.income} />
      <InstitutionSpendingChart
        data={d.institutions}
        onInstitution={(id) =>
          drill({ institutions: [id], movement: "consumption" })
        }
      />
      <BenefitsUsageChart
        data={d.benefits}
        onWallet={(id) => navigate({ name: "wallet", id })}
      />
      <MonthlyComparisonChart
        data={d.months}
        onExpand={() => setFilters({ ...filters, ...periodRange("6m", today) })}
        currentMonth={today.slice(0, 7)}
        onPeriod={(start, end) => drill({ start, end })}
      />
      <Label muted size={11}>
        Cobertura limitada às movimentações registradas. Dias sem registros não
        garantem ausência de gastos. Estornos reduzem despesas na data do
        crédito. Receitas excluem recargas e estornos.
      </Label>
      {walletId &&
        ["food", "meal", "benefit"].includes(
          repository.wallets().find((w) => w.id === walletId)?.kind ?? "",
        ) && (
          <ChartCard title="Gastos por estabelecimento">
            {analytics.getSpendingByMerchant(f).map((m) => (
              <View key={m.id} style={s.row}>
                <Label>{m.name}</Label>
                <Label bold>{money(m.total, prefs.hidden)}</Label>
              </View>
            ))}
          </ChartCard>
        )}
    </>
  );
}
export function History({ navigate }: { navigate: Navigate }) {
  const { analytics, filters, setFilters, revision, prefs } = useStore();
  const [pages, setPages] = useState(1);
  const signature = JSON.stringify(filters);
  useEffect(() => setPages(1), [signature]);
  const rows = useMemo(
    () =>
      Array.from({ length: pages }, (_, i) =>
        analytics.history(filters, 100, i * 100),
      ).flat(),
    [analytics, revision, signature, pages],
  );
  const summary = useMemo(
    () => analytics.getFinancialSummary(filters),
    [analytics, revision, signature],
  );
  return (
    <>
      <Heading
        title="Movimentações"
        subtitle="Todos os seus registros em um só lugar."
      />
      <FiltersPanel />
      <Card>
        <Label>
          Despesas líquidas · {money(summary.expenses, prefs.hidden)}
        </Label>
        <Label>Receitas · {money(summary.income, prefs.hidden)}</Label>
        <Label muted size={12}>
          {summary.count} movimentações confirmadas · transferências e faturas
          não compõem as despesas
        </Label>
      </Card>
      <View style={s.wrap}>
        <Action
          title="+ Nova"
          onPress={() => navigate({ name: "newTransaction" })}
        />
        <Action
          secondary
          title="Despesas de consumo"
          onPress={() => setFilters({ ...filters, movement: "consumption" })}
        />
      </View>
      {rows.length ? (
        rows.map((r) => (
          <TransactionRow
            key={r.id}
            row={r}
            onPress={() => navigate({ name: "transaction", id: r.id })}
          />
        ))
      ) : (
        <ChartEmptyState />
      )}
      {rows.length === pages * 100 && (
        <Action
          secondary
          title="Carregar mais"
          onPress={() => setPages((n) => n + 1)}
        />
      )}
    </>
  );
}
export function Wallets({ navigate }: { navigate: Navigate }) {
  const { analytics, today, prefs, revision } = useStore();
  const wallets = useMemo(
    () => analytics.walletBalances(today),
    [analytics, today, revision],
  );
  return (
    <>
      <Heading
        title="Carteiras"
        subtitle="Seu dinheiro organizado por origem."
      />
      {(["account", "credit", "benefits"] as const).map((group) => (
        <View key={group} style={{ gap: 12 }}>
          <Label muted bold size={11}>
            {
              {
                account: "BANCOS",
                credit: "CARTÕES DE CRÉDITO",
                benefits: "BENEFÍCIOS",
              }[group]
            }
          </Label>
          {wallets
            .filter((w) =>
              group === "benefits"
                ? ["food", "meal", "benefit"].includes(w.kind)
                : w.kind === group,
            )
            .map((w) => (
              <Pressable
                accessibilityRole="button"
                key={w.id}
                onPress={() => navigate({ name: "wallet", id: w.id })}
              >
                <Card>
                  <View style={s.row}>
                    <TransactionIcon institution={w.institution} forceLogo />
                    <View style={{ flex: 1, gap: 5 }}>
                      <Label bold size={16}>
                        {w.institution}
                      </Label>
                      <Label muted size={11}>
                        {w.name} · {walletLabels[w.kind]}
                      </Label>
                    </View>
                    <View style={{ alignItems: "flex-end", maxWidth: "42%" }}>
                      <Label bold>
                        {w.kind === "credit"
                          ? "Ver gastos"
                          : w.balance === null
                            ? "Sem referência"
                            : money(w.balance, prefs.hidden)}
                      </Label>
                      <Label muted size={10}>
                        {w.kind === "credit"
                          ? "Limite não é saldo"
                          : "Estimado"}
                      </Label>
                    </View>
                  </View>
                </Card>
              </Pressable>
            ))}
        </View>
      ))}
      {!wallets.length && (
        <ChartEmptyState message="Cadastre uma conta, cartão ou benefício para começar." />
      )}
      <Action
        secondary
        title="+ Adicionar carteira"
        onPress={() => navigate({ name: "newWallet" })}
      />
    </>
  );
}
export function WalletDetail({
  id,
  navigate,
}: {
  id: string;
  navigate: Navigate;
}) {
  const { analytics, today, prefs, filters, setFilters } = useStore();
  const wallet = analytics.walletBalances(today).find((w) => w.id === id);
  if (!wallet) return <Label>Carteira não encontrada.</Label>;
  return (
    <>
      <Heading title={`${wallet.institution} · ${wallet.name}`} />
      <Card>
        <Label muted>
          {wallet.kind === "credit"
            ? "Cartão de crédito · limite não tratado como saldo"
            : "Saldo estimado completo"}
        </Label>
        <Label size={29} bold>
          {wallet.kind === "credit"
            ? "Consulte as despesas"
            : wallet.balance === null
              ? "Referência incompleta"
              : money(wallet.balance, prefs.hidden)}
        </Label>
        <Label muted size={12}>
          Compras sem registro podem alterar o saldo real.
        </Label>
      </Card>
      <Action
        secondary
        title="Ver histórico desta carteira"
        onPress={() => {
          setFilters({
            ...filters,
            walletIds: [id],
            institutions: [],
            walletKinds: [],
          });
          navigate({ name: "history" });
        }}
      />
      <Analysis navigate={navigate} walletId={id} />
    </>
  );
}
export function TransactionDetail({
  id,
  navigate,
}: {
  id: string;
  navigate: Navigate;
}) {
  const { repository, refresh, prefs } = useStore();
  const raw = repository.db.getFirstSync<Transaction>(
    "SELECT * FROM transactions WHERE id=?",
    id,
  );
  if (!raw) return <Label>Movimentação não encontrada.</Label>;
  const tx = { ...raw, deleted: Boolean(raw.deleted) };
  const wallet = repository.wallets().find((w) => w.id === tx.walletId);
  const candidates = repository.db.getAllSync<{
    id: string;
    title: string;
    amountCents: number;
  }>(
    "SELECT id,title,amountCents FROM transactions WHERE walletId=? AND id<>? AND kind=? AND duplicateOf IS NULL AND deleted=0 AND status='confirmed' ORDER BY localDate DESC LIMIT 30",
    tx.walletId,
    id,
    tx.kind,
  );
  const saveChange = (change: Transaction) => {
    try {
      repository.saveTransaction(change);
      refresh();
      navigate({ name: "history" });
    } catch (error) {
      Alert.alert(
        "Não foi possível alterar",
        error instanceof Error ? error.message : "Tente novamente.",
      );
    }
  };
  return (
    <>
      <Heading
        title={tx.title}
        subtitle={`${wallet?.institution} · ${wallet?.name}`}
      />
      <Label size={33} bold>
        {money(tx.amountCents, prefs.hidden)}
      </Label>
      <Label>
        {kindLabels[tx.kind]} · {tx.localDate}
      </Label>
      <Label muted>
        {tx.duplicateOf
          ? "Conciliada com outra fonte · excluída das métricas"
          : tx.status === "pending"
            ? "Pendente · excluída das métricas"
            : "Confirmada"}
      </Label>
      <Action
        title="Editar movimentação"
        onPress={() => navigate({ name: "editTransaction", transaction: tx })}
      />
      <Card>
        <Label bold>Conciliar duplicata</Label>
        <Label muted size={12}>
          Selecione somente se este registro representa exatamente a mesma
          operação. O original permanece nas métricas.
        </Label>
        {candidates.map((c) => (
          <Action
            secondary
            key={c.id}
            title={`${c.title} · ${money(c.amountCents, prefs.hidden)}`}
            onPress={() =>
              Alert.alert(
                "Conciliar registros?",
                "Este registro ficará fora das métricas.",
                [
                  { text: "Cancelar", style: "cancel" },
                  {
                    text: "Conciliar",
                    onPress: () => {
                      saveChange({ ...tx, duplicateOf: c.id });
                    },
                  },
                ],
              )
            }
          />
        ))}
      </Card>
      <Action
        secondary
        title="Excluir movimentação"
        onPress={() =>
          Alert.alert(
            "Excluir movimentação?",
            "A exclusão será sincronizada com sua conta.",
            [
              { text: "Cancelar", style: "cancel" },
              {
                text: "Excluir",
                style: "destructive",
                onPress: () => {
                  saveChange({ ...tx, deleted: true });
                },
              },
            ],
          )
        }
      />
    </>
  );
}
export function Settings({ navigate }: { navigate: Navigate }) {
  const {
    prefs,
    updatePreferences,
    sync,
    syncState,
    syncing,
    repository,
    refresh,
    owner,
  } = useStore();
  return (
    <>
      <Heading title="Ajustes" />
      <Label bold size={18}>
        Aparência
      </Label>
      <Card>
        <Label bold>Ícones das movimentações</Label>
        <Action
          secondary
          title="Logos das instituições"
          selected={prefs.iconMode === "institution"}
          onPress={() => updatePreferences({ iconMode: "institution" })}
        />
        <Action
          secondary
          title="Ícones das categorias"
          selected={prefs.iconMode === "category"}
          onPress={() => updatePreferences({ iconMode: "category" })}
        />
        <Label muted size={12}>
          Aplicação imediata, mesmo sem internet.
        </Label>
      </Card>
      <View style={s.wrap}>
        {(["system", "light", "dark"] as const).map((t) => (
          <Action
            secondary
            key={t}
            title={{ system: "Automático", light: "Light", dark: "Dark" }[t]}
            selected={prefs.theme === t}
            onPress={() => updatePreferences({ theme: t })}
          />
        ))}
      </View>
      <Action
        secondary
        title={prefs.hidden ? "Mostrar valores" : "Ocultar valores financeiros"}
        onPress={() => updatePreferences({ hidden: !prefs.hidden })}
      />
      <Action
        secondary
        title="Categorias personalizadas"
        onPress={() => navigate({ name: "newCategory" })}
      />
      <Action
        secondary
        title="Automações e capturas"
        onPress={() => navigate({ name: "capture" })}
      />
      <Action
        secondary
        title={owner ? "Conta conectada" : "Entrar ou criar conta"}
        onPress={() => navigate({ name: "account" })}
      />
      <Label muted size={12}>
        {syncState}
      </Label>
      <Action
        secondary
        disabled={syncing || !owner}
        title={syncing ? "Sincronizando…" : "Sincronizar agora"}
        onPress={() => void sync()}
      />
      {repository.conflicts().map((c) => (
        <Card key={`${c.entity}:${c.entityId}`}>
          <Label bold>Revisar conflito · {c.entity}</Label>
          <Label muted size={12}>
            Há duas versões deste registro. Compare os valores antes de
            escolher.
          </Label>
          <Label>Local: {describePayload(c.localPayload, prefs.hidden)}</Label>
          <Label>Conta: {describePayload(c.remotePayload, prefs.hidden)}</Label>
          <Action
            secondary
            title="Manter versão local"
            onPress={() => {
              repository.resolveConflict(c.entity, c.entityId, "local");
              refresh();
            }}
          />
          <Action
            secondary
            title="Usar versão da conta"
            onPress={() => {
              repository.resolveConflict(c.entity, c.entityId, "remote");
              refresh();
            }}
          />
        </Card>
      ))}
    </>
  );
}
function describePayload(json: string, hidden: boolean) {
  const p = JSON.parse(json);
  return [
    p.title ?? p.name ?? "Preferência",
    p.amountCents != null ? money(p.amountCents, hidden) : "",
    p.localDate ?? "",
    p.kind ?? "",
  ]
    .filter(Boolean)
    .join(" · ");
}
export function Account({ onDone }: { onDone: () => void }) {
  const { owner, setOwner } = useStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [signup, setSignup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (owner)
    return (
      <>
        <Heading title="Conta conectada" />
        <Label muted>
          Seus dados ficam disponíveis offline neste aparelho. Cada conta usa
          seu próprio banco local.
        </Label>
        <Action
          secondary
          title="Sair da conta"
          onPress={() => {
            void auth.signOut().finally(() => {
              setOwner(null);
              onDone();
            });
          }}
        />
      </>
    );
  return (
    <>
      <Heading
        title={signup ? "Crie sua conta." : "Que bom ter você de volta."}
      />
      <Label muted>
        O espaço local sem conta permanece separado. Ao entrar, o Caxe abre o
        banco local da sua conta.
      </Label>
      {!apiURL && (
        <Label>
          A sincronização ainda não está configurada nesta versão. Você pode
          continuar usando o Caxe neste aparelho.
        </Label>
      )}
      {signup && (
        <Field label="Nome completo" value={name} onChangeText={setName} />
      )}
      <Field label="E-mail" value={email} onChangeText={setEmail} />
      <Field
        label="Senha · mínimo 10 caracteres"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />
      {!!error && <Label accessibilityRole="alert">{error}</Label>}
      <Action
        title={busy ? "Aguarde…" : signup ? "Criar conta" : "Entrar"}
        disabled={busy || !apiURL}
        onPress={() => {
          setBusy(true);
          void (async () => {
            try {
              const r = signup
                ? await auth.signUp.email({
                    email: email.trim(),
                    password,
                    name: name.trim(),
                  })
                : await auth.signIn.email({ email: email.trim(), password });
              if (r.error)
                throw new Error(r.error.message ?? "Falha na autenticação");
              if (!r.data?.user.id) throw new Error("Sessão não recebida");
              setOwner(r.data.user.id);
              onDone();
            } catch (e) {
              setError(
                e instanceof Error ? e.message : "Não foi possível conectar.",
              );
            } finally {
              setBusy(false);
            }
          })();
        }}
      />
      <Action
        secondary
        title={signup ? "Já tenho uma conta" : "Criar minha conta"}
        onPress={() => setSignup(!signup)}
      />
    </>
  );
}
export function Capture({ navigate }: { navigate: Navigate }) {
  const { repository, refresh, revision } = useStore();
  const [text, setText] = useState("");
  const [search, setSearch] = useState("");
  const sources = useMemo(() => notificationModule?.sources() ?? [], []);
  const [packages, setPackages] = useState(
    () =>
      repository.db.getFirstSync<{ value: string }>(
        "SELECT value FROM sync_meta WHERE id='capture-packages'",
      )?.value ?? "",
  );
  const [enabled, setEnabled] = useState(
    notificationModule?.isEnabled() ?? false,
  );
  useEffect(() => {
    const drain = () => {
      try {
        drainNotifications(repository.db);
        setEnabled(notificationModule?.isEnabled() ?? false);
        refresh();
      } catch {
        Alert.alert(
          "Captura indisponível",
          "Não foi possível ler as capturas. Tente novamente.",
        );
      }
    };
    drain();
    const listener = AppState.addEventListener("change", (s) => {
      if (s === "active") drain();
    });
    return () => listener.remove();
  }, [repository, refresh]);
  const inbox = useMemo(
    () =>
      repository.db.getAllSync<CaptureDraft>(
        "SELECT * FROM capture_inbox ORDER BY receivedAt DESC",
      ),
    [repository, revision],
  );
  return (
    <>
      <Heading
        title="Automações"
        subtitle="Você revisa cada captura antes de registrá-la."
      />
      <Card>
        <Label bold>
          {Platform.OS === "android"
            ? enabled
              ? "Acesso a notificações autorizado"
              : "Autorize o acesso no Android"
            : "iPhone · Atalhos e texto compartilhado"}
        </Label>
        <Label muted>
          {Platform.OS === "android"
            ? "Somente os aplicativos escolhidos abaixo são lidos. A captura fica no aparelho."
            : "O iOS não permite ler notificações de outros aplicativos. Use um Atalho com texto recebido por você e a ação “Abrir URLs”, ou cole o texto abaixo."}
        </Label>
        {Platform.OS === "android" && (
          <>
            <Field
              label="Buscar aplicativo"
              value={search}
              onChangeText={setSearch}
            />
            <ScrollView style={{ maxHeight: 240 }} nestedScrollEnabled>
              <View style={{ gap: 8 }}>
                {sources
                  .filter((source) =>
                    source.name
                      .toLocaleLowerCase("pt-BR")
                      .includes(search.toLocaleLowerCase("pt-BR")),
                  )
                  .map((source) => (
                    <Action
                      secondary
                      key={source.id}
                      title={source.name}
                      selected={packages.split(",").includes(source.id)}
                      onPress={() => {
                        const ids = packages.split(",").filter(Boolean);
                        setPackages(
                          (ids.includes(source.id)
                            ? ids.filter((id) => id !== source.id)
                            : [...ids, source.id]
                          ).join(","),
                        );
                      }}
                    />
                  ))}
              </View>
            </ScrollView>
            <Action
              secondary
              title="Salvar fontes e configurar acesso"
              onPress={() => {
                notificationModule?.setPackages(
                  packages
                    .split(",")
                    .map((x) => x.trim())
                    .filter(Boolean),
                );
                repository.db.runSync(
                  "INSERT OR REPLACE INTO sync_meta VALUES (?,?)",
                  "capture-packages",
                  packages,
                );
                notificationModule?.openSettings();
              }}
            />
            {!notificationModule && (
              <Label>
                Requer um Development Build com o módulo nativo do Caxe.
              </Label>
            )}
          </>
        )}
        {Platform.OS === "ios" && (
          <Label size={12}>
            URL do Atalho: caxe://capture?text=SEU_TEXTO_CODIFICADO
          </Label>
        )}
      </Card>
      <Field
        label="Cole o texto da notificação"
        value={text}
        onChangeText={setText}
        multiline
      />
      <Action
        title="Revisar texto"
        disabled={!text.trim()}
        onPress={() => {
          if (text.length > 8000) {
            Alert.alert("Texto muito longo", "Use até 8.000 caracteres.");
            return;
          }
          const capture = {
            id: uid(),
            text: text.trim(),
            source: "manual",
            receivedAt: new Date().toISOString(),
          };
          repository.db.runSync(
            "INSERT INTO capture_inbox VALUES (?,?,?,?)",
            capture.id,
            capture.text,
            capture.source,
            capture.receivedAt,
          );
          refresh();
          setText("");
          navigate({ name: "review", capture });
        }}
      />
      <Label bold>Capturas pendentes · {inbox.length}</Label>
      {inbox.map((c) => (
        <Card key={c.id}>
          <Label numberOfLines={3}>{c.text}</Label>
          <Label muted size={11}>
            {c.source}
          </Label>
          <Action
            secondary
            title="Revisar"
            onPress={() => navigate({ name: "review", capture: c })}
          />
          <Action
            secondary
            title="Descartar captura"
            onPress={() => {
              repository.db.runSync(
                "DELETE FROM capture_inbox WHERE id=?",
                c.id,
              );
              refresh();
            }}
          />
        </Card>
      ))}
    </>
  );
}
