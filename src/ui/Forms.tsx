import { useState, useMemo, useEffect } from "react";
import { View } from "react-native";
import { useStore, uid } from "./store";
import { Action, Field, Label, s, TransactionIcon } from "./components";
import {
  parseMoney,
  transactionKinds,
  walletKinds,
  iconNames,
  colorNames,
  localDate,
  money,
} from "../domain/model";
import type { Wallet, Transaction } from "../domain/model";
import { parseNotification } from "../domain/capture";
import { bankPresets, benefitPresets } from "../domain/institutions";

export const kindLabels: Record<Transaction["kind"], string> = {
  expense: "Compra / despesa",
  income: "Receita",
  refund: "Estorno",
  transfer_in: "Transferência própria · entrada",
  transfer_out: "Transferência própria · saída",
  bill_payment: "Pagamento de fatura",
  topup: "Recarga de benefício",
};
export const walletLabels: Record<Wallet["kind"], string> = {
  account: "Conta",
  credit: "Cartão de crédito",
  food: "Alimentação",
  meal: "Refeição",
  benefit: "Outro benefício",
};
export function WalletForm({ onDone }: { onDone: () => void }) {
  const { repository, refresh, today } = useStore();
  const [name, setName] = useState("");
  const [institution, setInstitution] = useState("");
  const [kind, setKind] = useState<Wallet["kind"]>("account");
  const [balance, setBalance] = useState("");
  const [date, setDate] = useState(today);
  const [error, setError] = useState("");
  return (
    <View style={{ gap: 18 }}>
      <Label style={s.title}>Adicionar carteira</Label>
      <Label muted>
        Informe uma referência real. Deixe o saldo vazio se não souber.
      </Label>
      <Field
        label="Instituição"
        value={institution}
        onChangeText={setInstitution}
      />
      <View style={s.wrap}>
        {(["food", "meal", "benefit"].includes(kind)
          ? benefitPresets
          : bankPresets
        ).map((x) => (
          <Action
            secondary
            key={x}
            title={x}
            onPress={() => setInstitution(x)}
          />
        ))}
      </View>
      <Field
        label="Nome da carteira"
        value={name}
        onChangeText={setName}
        placeholder="Ex.: Alimentação"
      />
      <View style={s.wrap}>
        {walletKinds.map((k) => (
          <Action
            secondary
            key={k}
            selected={kind === k}
            title={walletLabels[k]}
            onPress={() => setKind(k)}
          />
        ))}
      </View>
      {kind !== "credit" && (
        <>
          <Field
            label="Saldo inicial (R$) · opcional"
            value={balance}
            onChangeText={setBalance}
            numeric
          />
          <Field
            label="Data de referência · AAAA-MM-DD"
            value={date}
            onChangeText={setDate}
          />
          <Label muted size={12}>
            O saldo considera os lançamentos a partir desta data, inclusive. Use
            o saldo no início do dia.
          </Label>
        </>
      )}
      {!!error && <Label accessibilityRole="alert">{error}</Label>}
      <Action
        title="Salvar carteira"
        onPress={() => {
          try {
            repository.saveWallet({
              id: uid(),
              name: name.trim(),
              institution: institution.trim(),
              kind,
              openingCents:
                kind === "credit" || !balance ? null : parseMoney(balance),
              openingDate: date,
            });
            refresh();
            onDone();
          } catch {
            setError("Verifique o nome, a instituição, a data e o saldo.");
          }
        }}
      />
    </View>
  );
}
export type CaptureDraft = {
  id: string;
  text: string;
  receivedAt: string;
  source: string;
};
export function TransactionForm({
  onDone,
  capture,
  edit,
}: {
  onDone: () => void;
  capture?: CaptureDraft;
  edit?: Transaction;
}) {
  const { repository, refresh, today, revision, prefs } = useStore();
  const wallets = repository.wallets();
  const categories = repository.categories();
  const parsed = capture ? parseNotification(capture.text) : null;
  const [title, setTitle] = useState(edit?.title ?? parsed?.title ?? "");
  const [value, setValue] = useState(
    edit
      ? (edit.amountCents / 100).toFixed(2).replace(".", ",")
      : parsed
        ? (parsed.amountCents / 100).toFixed(2).replace(".", ",")
        : "",
  );
  const [kind, setKind] = useState<Transaction["kind"]>(
    edit?.kind ?? parsed?.kind ?? "expense",
  );
  const [walletId, setWalletId] = useState(() => {
    if (edit) return edit.walletId;
    if (parsed?.kind === "topup")
      return (
        wallets.find((w) => ["food", "meal", "benefit"].includes(w.kind))?.id ??
        ""
      );
    if (parsed?.kind === "income")
      return wallets.find((w) => w.kind === "account")?.id ?? "";
    return wallets[0]?.id ?? "";
  });
  const [categoryId, setCategoryId] = useState<string | null>(
    edit?.categoryId ?? null,
  );
  const [date, setDate] = useState(
    edit?.localDate ?? (capture ? localDate(capture.receivedAt) : today),
  );
  const [refundOf, setRefundOf] = useState<string | null>(
    edit?.refundOf ?? null,
  );
  const [error, setError] = useState("");
  const [duplicateChoice, setDuplicateChoice] = useState<string | null>(null);
  useEffect(() => setDuplicateChoice(null), [walletId, kind, value, date]);
  const selectableWallets = wallets
    .filter(
      (w) => kind !== "topup" || ["food", "meal", "benefit"].includes(w.kind),
    )
    .filter((w) => kind !== "income" || w.kind === "account");
  useEffect(() => {
    if (selectableWallets.some((w) => w.id === walletId)) return;
    setWalletId(selectableWallets[0]?.id ?? "");
    setRefundOf(null);
  }, [kind, walletId, selectableWallets]);
  const duplicates = useMemo(() => {
    if (edit) return [];
    try {
      return repository.duplicateCandidates({
        id: "new",
        walletId,
        kind,
        amountCents: parseMoney(value),
        localDate: date,
      });
    } catch {
      return [];
    }
  }, [repository, revision, edit, walletId, kind, value, date]);
  const purchases = repository.db.getAllSync<{
    id: string;
    title: string;
    amountCents: number;
  }>(
    "SELECT id,title,amountCents FROM transactions WHERE walletId=? AND kind='expense' AND status='confirmed' AND duplicateOf IS NULL AND deleted=0 ORDER BY localDate DESC LIMIT 100",
    walletId,
  );
  return (
    <View style={{ gap: 18 }}>
      <Label style={s.title}>
        {edit
          ? "Editar movimentação"
          : capture
            ? "Revisar captura"
            : "Nova movimentação"}
      </Label>
      {capture && (
        <>
          <Label muted>{capture.text}</Label>
          <Label muted size={12}>
            Fonte: {capture.source}
          </Label>
        </>
      )}
      <Field label="Descrição" value={title} onChangeText={setTitle} />
      <Field
        label="Valor em reais · sem pontos"
        value={value}
        onChangeText={setValue}
        numeric
      />
      <Field label="Data · AAAA-MM-DD" value={date} onChangeText={setDate} />
      <Label bold>Carteira</Label>
      <View style={s.wrap}>
        {selectableWallets.map((w) => (
          <Action
            secondary
            selected={walletId === w.id}
            key={w.id}
            title={`${w.institution} · ${w.name}`}
            onPress={() => {
              setWalletId(w.id);
              setRefundOf(null);
            }}
          />
        ))}
      </View>
      {!wallets.length && (
        <Label>Adicione uma carteira antes de registrar a movimentação.</Label>
      )}
      <Label bold>Tipo</Label>
      <View style={s.wrap}>
        {transactionKinds.map((k) => (
          <Action
            secondary
            key={k}
            selected={kind === k}
            title={kindLabels[k]}
            onPress={() => setKind(k)}
          />
        ))}
      </View>
      {kind === "refund" && (
        <>
          <Label bold>Compra original</Label>
          <View style={s.wrap}>
            {purchases.map((p) => (
              <Action
                secondary
                key={p.id}
                selected={refundOf === p.id}
                title={`${p.title} · ${(p.amountCents / 100).toFixed(2)}`}
                onPress={() => setRefundOf(p.id)}
              />
            ))}
          </View>
          <Label muted size={12}>
            O estorno reduz a despesa na data do crédito e usa a categoria da
            compra.
          </Label>
        </>
      )}
      <Label bold>Categoria</Label>
      <View style={s.wrap}>
        <Action
          secondary
          selected={!categoryId}
          title="Classificar depois"
          onPress={() => setCategoryId(null)}
        />
        {categories.map((c) => (
          <Action
            secondary
            key={c.id}
            selected={categoryId === c.id}
            title={c.name}
            onPress={() => setCategoryId(c.id)}
          />
        ))}
      </View>
      {!!error && <Label accessibilityRole="alert">{error}</Label>}
      {!!duplicates.length && (
        <View style={{ gap: 10 }}>
          <Label bold>Possível duplicata</Label>
          <Label muted size={12}>
            Há registros com o mesmo valor, tipo, carteira e dia. Confira antes
            de salvar; compras diferentes podem ter valores iguais.
          </Label>
          {duplicates.map((d) => (
            <Action
              secondary
              key={d.id}
              selected={duplicateChoice === d.id}
              title={`É a mesma operação: ${d.title} · ${money(d.amountCents, prefs.hidden)}`}
              onPress={() => setDuplicateChoice(d.id)}
            />
          ))}
          <Action
            secondary
            title="É outra operação, mesmo com o valor igual"
            selected={duplicateChoice === "different"}
            onPress={() => setDuplicateChoice("different")}
          />
        </View>
      )}
      <Action
        disabled={!walletId || (duplicates.length > 0 && !duplicateChoice)}
        title={capture ? "Confirmar e salvar" : "Salvar movimentação"}
        onPress={() => {
          try {
            if (kind === "refund" && !refundOf)
              throw new Error("Selecione a compra original.");
            const occurredAt =
              edit?.localDate === date
                ? edit.occurredAt
                : new Date(`${date}T12:00:00-03:00`).toISOString();
            repository.saveTransaction({
              id: edit?.id ?? uid(),
              title: title.trim(),
              amountCents: parseMoney(value),
              walletId,
              categoryId,
              kind,
              occurredAt,
              localDate: date,
              status: "confirmed",
              sourceKey:
                edit?.sourceKey ?? (capture ? `capture:${capture.id}` : null),
              duplicateOf:
                edit?.duplicateOf ??
                (duplicateChoice && duplicateChoice !== "different"
                  ? duplicateChoice
                  : null),
              refundOf: kind === "refund" ? refundOf : null,
              deleted: false,
            });
            if (capture)
              repository.db.runSync(
                "DELETE FROM capture_inbox WHERE id=?",
                capture.id,
              );
            refresh();
            onDone();
          } catch (err) {
            setError(
              err instanceof Error ? err.message : "Não foi possível salvar.",
            );
          }
        }}
      />
    </View>
  );
}
export function CategoryForm({ onDone }: { onDone: () => void }) {
  const { repository, refresh } = useStore();
  const [name, setName] = useState("");
  const [icon, setIcon] = useState<(typeof iconNames)[number]>("other");
  const [color, setColor] = useState<(typeof colorNames)[number]>("lime");
  const [error, setError] = useState("");
  return (
    <View style={{ gap: 18 }}>
      <Label style={s.title}>Categoria personalizada</Label>
      <Field label="Nome" value={name} onChangeText={setName} />
      <TransactionIcon
        institution="Prévia"
        icon={icon}
        color={color}
        forceCategory
      />
      <Label>Ícone</Label>
      <View style={s.wrap}>
        {iconNames.map((x) => (
          <Action
            secondary
            key={x}
            title={
              {
                cart: "Carrinho",
                utensils: "Talheres",
                car: "Carro",
                heart: "Saúde",
                home: "Casa",
                calendar: "Calendário",
                book: "Livro",
                ticket: "Ingresso",
                bag: "Sacola",
                arrows: "Setas",
                income: "Entrada",
                other: "Genérico",
              }[x]
            }
            selected={icon === x}
            onPress={() => setIcon(x)}
          />
        ))}
      </View>
      <Label>Cor</Label>
      <View style={s.wrap}>
        {colorNames.map((x) => (
          <Action
            secondary
            key={x}
            title={x}
            selected={color === x}
            onPress={() => setColor(x)}
          />
        ))}
      </View>
      {!!error && <Label>{error}</Label>}
      <Action
        title="Criar categoria"
        onPress={() => {
          try {
            repository.saveCategory({
              id: uid(),
              name: name.trim(),
              icon,
              color,
            });
            refresh();
            onDone();
          } catch {
            setError("Informe um nome de até 80 caracteres.");
          }
        }}
      />
    </View>
  );
}
