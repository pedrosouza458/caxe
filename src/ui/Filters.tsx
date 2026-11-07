import { useState } from "react";
import { View, Modal, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useStore } from "./store";
import { Label, Action, Field, s } from "./components";
import { filterSchema, periodRange } from "../domain/model";
import type { Filters, Period } from "../domain/model";
export const periods: [Period, string][] = [
  ["today", "Hoje"],
  ["7d", "7 dias"],
  ["30d", "30 dias"],
  ["month", "Mês atual"],
  ["previous", "Mês anterior"],
  ["3m", "3 meses"],
  ["6m", "6 meses"],
  ["12m", "12 meses"],
];
export function FiltersPanel({
  fixedWalletId,
}: { fixedWalletId?: string } = {}) {
  const { filters, setFilters, theme, repository, today } = useStore();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(filters);
  const [error, setError] = useState("");
  const active = [
    ...filters.institutions,
    ...filters.walletIds.map(
      (id) => repository.wallets().find((w) => w.id === id)?.name ?? "Carteira",
    ),
    ...filters.categoryIds.map(
      (id) =>
        repository.categories().find((c) => c.id === id)?.name ??
        "Sem categoria",
    ),
    ...filters.walletKinds.map(
      (kind) =>
        ({
          account: "Conta",
          credit: "Cartão",
          food: "Alimentação",
          meal: "Refeição",
          benefit: "Benefício",
        })[kind],
    ),
    filters.movement === "all"
      ? ""
      : {
          in: "Entradas",
          out: "Saídas",
          consumption: "Despesas de consumo",
          financial: "Movimentações financeiras",
        }[filters.movement],
  ].filter(Boolean);
  const toggle = (
    key: "institutions" | "walletIds" | "categoryIds" | "walletKinds",
    value: string,
  ) =>
    setDraft({
      ...draft,
      [key]: draft[key].includes(value as never)
        ? draft[key].filter((x) => x !== value)
        : [...draft[key], value],
    });
  const choices = (
    label: string,
    key: "institutions" | "walletIds" | "categoryIds" | "walletKinds",
    items: { id: string; name: string }[],
  ) => (
    <View style={{ gap: 10 }}>
      <Label bold>{label}</Label>
      <View style={s.wrap}>
        <Action
          secondary
          title="Todas"
          selected={!draft[key].length}
          onPress={() => setDraft({ ...draft, [key]: [] })}
        />
        {items.map((x) => (
          <Action
            secondary
            key={x.id}
            title={x.name}
            selected={draft[key].includes(x.id as never)}
            onPress={() => toggle(key, x.id)}
          />
        ))}
      </View>
    </View>
  );
  return (
    <>
      <Action
        secondary
        title={`Filtros · ${filters.start.split("-").reverse().join("/")} a ${filters.end.split("-").reverse().join("/")}`}
        onPress={() => {
          setDraft(
            fixedWalletId
              ? { ...filters, walletIds: [fixedWalletId] }
              : filters,
          );
          setOpen(true);
        }}
      />
      {!!active.length && (
        <Label muted size={12}>
          {active.join(" · ")}
        </Label>
      )}
      <Modal
        visible={open}
        animationType="slide"
        onRequestClose={() => setOpen(false)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg }}>
          <ScrollView
            contentContainerStyle={s.page}
            keyboardShouldPersistTaps="handled"
          >
            <Label style={s.title}>Filtros da análise</Label>
            <Label muted>
              As escolhas se combinam e permanecem ao navegar.
            </Label>
            <View style={s.wrap}>
              {periods.map(([key, title]) => (
                <Action
                  secondary
                  key={key}
                  title={title}
                  onPress={() =>
                    setDraft({ ...draft, ...periodRange(key, today) })
                  }
                />
              ))}
            </View>
            <Field
              label="Data inicial · AAAA-MM-DD"
              value={draft.start}
              onChangeText={(start) => setDraft({ ...draft, start })}
            />
            <Field
              label="Data final · AAAA-MM-DD"
              value={draft.end}
              onChangeText={(end) => setDraft({ ...draft, end })}
            />
            {choices(
              "Instituições",
              "institutions",
              [...new Set(repository.wallets().map((w) => w.institution))].map(
                (id) => ({ id, name: id }),
              ),
            )}
            {choices("Tipo de carteira", "walletKinds", [
              { id: "account", name: "Conta" },
              { id: "credit", name: "Cartão de crédito" },
              { id: "food", name: "Alimentação" },
              { id: "meal", name: "Refeição" },
              { id: "benefit", name: "Outros benefícios" },
            ])}
            {fixedWalletId ? (
              <Label>
                Carteira:{" "}
                {repository.wallets().find((w) => w.id === fixedWalletId)?.name}
              </Label>
            ) : (
              choices(
                "Carteiras",
                "walletIds",
                repository
                  .wallets()
                  .filter(
                    (w) =>
                      !draft.institutions.length ||
                      draft.institutions.includes(w.institution),
                  )
                  .map((w) => ({
                    id: w.id,
                    name: `${w.institution} · ${w.name}`,
                  })),
              )
            )}
            {choices("Categorias", "categoryIds", [
              ...repository.categories(),
              { id: "uncategorized", name: "Sem categoria" },
            ])}
            <Label bold>Tipo de movimentação</Label>
            <View style={s.wrap}>
              {(
                [
                  ["all", "Todas"],
                  ["in", "Entradas"],
                  ["out", "Saídas"],
                  ["consumption", "Despesas de consumo"],
                  ["financial", "Movimentações financeiras"],
                ] as [Filters["movement"], string][]
              ).map(([key, title]) => (
                <Action
                  secondary
                  key={key}
                  title={title}
                  selected={draft.movement === key}
                  onPress={() => setDraft({ ...draft, movement: key })}
                />
              ))}
            </View>
            {!!error && <Label accessibilityRole="alert">{error}</Label>}
            <Action
              title="Aplicar filtros"
              onPress={() => {
                const parsed = filterSchema.safeParse(draft);
                if (!parsed.success) {
                  setError(
                    "Verifique as datas: use um período válido de até 10 anos.",
                  );
                  return;
                }
                setFilters(parsed.data);
                setError("");
                setOpen(false);
              }}
            />
            <Action
              secondary
              title="Limpar filtros"
              onPress={() =>
                setDraft({
                  ...periodRange("month", today),
                  institutions: [],
                  walletIds: fixedWalletId ? [fixedWalletId] : [],
                  walletKinds: [],
                  categoryIds: [],
                  movement: "all",
                })
              }
            />
            <Action secondary title="Cancelar" onPress={() => setOpen(false)} />
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </>
  );
}
