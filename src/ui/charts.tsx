import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Pressable,
  ScrollView,
  Animated,
  AccessibilityInfo,
} from "react-native";
import Svg, {
  Circle,
  Path,
  Line,
  Rect,
  Text as SvgText,
} from "react-native-svg";
import type { Breakdown, Bucket } from "../domain/analytics";
import { money, percentage } from "../domain/model";
import { useStore } from "./store";
import { categoryColor } from "./theme";
import {
  Label,
  ChartCard,
  ChartEmptyState,
  Action,
  TransactionIcon,
  s,
} from "./components";

function Fade({ children }: { children: React.ReactNode }) {
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    let animation: Animated.CompositeAnimation | undefined;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (!reduced) {
        opacity.setValue(0.4);
        animation = Animated.timing(opacity, {
          toValue: 1,
          duration: 220,
          useNativeDriver: true,
        });
        animation.start();
      }
    });
    return () => animation?.stop();
  }, [opacity]);
  return <Animated.View style={{ opacity, gap: 12 }}>{children}</Animated.View>;
}
function DataList({
  rows,
}: {
  rows: { label: string; value: string; onPress?: () => void }[];
}) {
  const [all, setAll] = useState(false);
  return (
    <View style={{ gap: 4 }}>
      {(all ? rows : rows.slice(-6)).map((r, i) => (
        <Pressable
          key={`${r.label}-${i}`}
          accessibilityRole={r.onPress ? "button" : undefined}
          onPress={r.onPress}
          style={({ pressed }) => ({
            minHeight: 44,
            justifyContent: "center",
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <View style={s.row}>
            <Label size={12} style={{ flex: 1 }}>
              {r.label}
            </Label>
            <Label
              size={12}
              bold
              style={{ maxWidth: "60%", textAlign: "right" }}
            >
              {r.value}
            </Label>
          </View>
        </Pressable>
      ))}
      {rows.length > 6 && (
        <Action
          secondary
          title={all ? "Recolher valores" : `Consultar ${rows.length} valores`}
          onPress={() => setAll(!all)}
        />
      )}
    </View>
  );
}
export function ExpenseDonutChart({
  data,
  total,
  onCategory,
  compact = false,
  onAll,
}: {
  data: Breakdown[];
  total: number;
  onCategory: (id: string) => void;
  compact?: boolean;
  onAll?: () => void;
}) {
  const { theme, prefs } = useStore();
  const [selected, setSelected] = useState<string | null>(null);
  const positive = data.filter((d) => d.total > 0);
  const denominator = positive.reduce((s, d) => s + d.total, 0);
  const color = (d: Breakdown) => categoryColor(d.color, theme);
  let offset = 0;
  const circumference = 2 * Math.PI * 65;
  return (
    <ChartCard
      title="Despesas por categoria"
      subtitle="Toque na legenda para consultar o histórico."
    >
      {!data.length ? (
        <ChartEmptyState />
      ) : (
        <Fade>
          <View style={{ alignItems: "center" }}>
            <Svg
              width={220}
              height={220}
              viewBox="0 0 220 220"
              accessible={false}
            >
              <Circle
                cx={110}
                cy={110}
                r={65}
                fill="none"
                stroke={theme.surface2}
                strokeWidth={23}
              />
              {positive.map((d) => {
                const length = (d.total / denominator) * circumference;
                const segment = (
                  <Circle
                    key={d.id}
                    cx={110}
                    cy={110}
                    r={65}
                    fill="none"
                    stroke={color(d)}
                    strokeWidth={selected === d.id ? 29 : 23}
                    strokeDasharray={`${length} ${circumference - length}`}
                    strokeDashoffset={-offset}
                    rotation={-90}
                    origin="110,110"
                    onPress={() => setSelected(d.id)}
                  />
                );
                offset += length;
                return segment;
              })}
              <SvgText
                fontFamily="Inter_400Regular"
                x={110}
                y={105}
                textAnchor="middle"
                fill={theme.muted}
                fontSize={11}
              >
                DESPESAS LÍQUIDAS
              </SvgText>
              <SvgText
                fontFamily="Inter_400Regular"
                x={110}
                y={128}
                textAnchor="middle"
                fill={theme.text}
                fontSize={17}
                fontWeight="600"
              >
                {money(total, prefs.hidden)}
              </SvgText>
            </Svg>
          </View>
          {selected && data.some((d) => d.id === selected) && (
            <Action
              secondary
              title={`${data.find((d) => d.id === selected)!.name} · ${money(data.find((d) => d.id === selected)!.total, prefs.hidden)} · Ver movimentações`}
              onPress={() => onCategory(selected)}
            />
          )}
          {(compact ? data.slice(0, 3) : data).map((d) => (
            <Pressable
              accessibilityRole="button"
              key={d.id}
              onPress={() => {
                setSelected(d.id);
                onCategory(d.id);
              }}
              style={({ pressed }) => ({
                ...s.row,
                minHeight: 48,
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <View
                style={{
                  flex: 1,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <TransactionIcon
                  institution=""
                  icon={d.icon}
                  color={d.color}
                  forceCategory
                />
                <Label size={13}>{d.name}</Label>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Label bold size={13}>
                  {money(d.total, prefs.hidden)}
                </Label>
                <Label muted size={11}>
                  {prefs.hidden ? "••••" : percentage(d.percent)} · {d.count}{" "}
                  {d.count === 1 ? "compra" : "compras"}
                </Label>
              </View>
            </Pressable>
          ))}
          {compact && data.length > 3 && onAll && (
            <Action
              secondary
              title={`Ver todas as ${data.length} categorias`}
              onPress={onAll}
            />
          )}
          {data.some((d) => d.total < 0) && (
            <Label muted size={11}>
              Estornos superiores às compras aparecem na lista. A rosca
              representa apenas categorias com despesa líquida positiva.
            </Label>
          )}
        </Fade>
      )}
    </ChartCard>
  );
}
const shortDate = (date: string) =>
  date.slice(5).split("-").reverse().join("/");
export function SpendingTrendChart({
  data,
  onPeriod,
}: {
  data: Bucket[];
  onPeriod: (start: string, end: string) => void;
}) {
  const { theme, prefs } = useStore();
  const [selected, setSelected] = useState<Bucket | null>(null);
  const width = Math.max(290, data.length * 26);
  const max = Math.max(1, ...data.map((d) => d.expense));
  const min = Math.min(0, ...data.map((d) => d.expense));
  const y = (v: number) => 150 - ((v - min) / (max - min)) * 120;
  const x = (i: number) =>
    20 + (width - 40) * (data.length === 1 ? 0.5 : i / (data.length - 1));
  let path = "";
  data.forEach((d, i) => {
    if (d.count)
      path += `${i && data[i - 1]!.count ? "L" : "M"}${x(i)},${y(d.expense)} `;
  });
  return (
    <ChartCard
      title="Evolução de gastos"
      subtitle="Dias sem registros ficam sem linha. Toque em um ponto para ver o valor."
    >
      {!data.some((d) => d.count) ? (
        <ChartEmptyState />
      ) : (
        <Fade>
          <ScrollView horizontal showsHorizontalScrollIndicator>
            <Svg width={width} height={190} accessible={false}>
              <Line
                x1={20}
                x2={width - 20}
                y1={y(0)}
                y2={y(0)}
                stroke={theme.border}
              />
              <Path
                d={path}
                fill="none"
                stroke={theme.limeText}
                strokeWidth={2.5}
              />
              {data.map((d, i) => (
                <React.Fragment key={d.date}>
                  {d.count > 0 && (
                    <Circle
                      cx={x(i)}
                      cy={y(d.expense)}
                      r={selected?.date === d.date ? 6 : 3}
                      fill={theme.limeText}
                    />
                  )}
                  <Rect
                    x={x(i) - 12}
                    y={0}
                    width={24}
                    height={170}
                    fill="transparent"
                    onPress={() => setSelected(d)}
                  />
                  {(i === 0 ||
                    i === data.length - 1 ||
                    i % Math.max(1, Math.floor(data.length / 5)) === 0) && (
                    <SvgText
                      fontFamily="Inter_400Regular"
                      x={x(i)}
                      y={180}
                      textAnchor="middle"
                      fill={theme.muted}
                      fontSize={10}
                    >
                      {shortDate(d.date)}
                    </SvgText>
                  )}
                </React.Fragment>
              ))}
            </Svg>
          </ScrollView>
          {selected && (
            <Action
              secondary
              title={`${shortDate(selected.date)} · ${selected.count ? money(selected.expense, prefs.hidden) : "Sem registros"} · Histórico`}
              onPress={() => onPeriod(selected.date, selected.end)}
            />
          )}
          <DataList
            rows={data.map((d) => ({
              label: `${shortDate(d.date)}${d.end !== d.date ? ` a ${shortDate(d.end)}` : ""}`,
              value: d.count ? money(d.expense, prefs.hidden) : "Sem registros",
              onPress: () => {
                setSelected(d);
                onPeriod(d.date, d.end);
              },
            }))}
          />
        </Fade>
      )}
    </ChartCard>
  );
}
export function IncomeExpenseChart({ data }: { data: Bucket[] }) {
  const { theme, prefs } = useStore();
  const [selected, setSelected] = useState<Bucket | null>(null);
  const max = Math.max(1, ...data.flatMap((d) => [d.expense, d.income]));
  const min = Math.min(0, ...data.map((d) => d.expense));
  const y = (value: number) => 145 - ((value - min) / (max - min)) * 125;
  const zero = y(0);
  const width = Math.max(290, data.length * 65);
  return (
    <ChartCard
      title="Receitas × despesas"
      subtitle="Sem transferências próprias, recargas ou pagamentos de fatura."
    >
      {!data.some((d) => d.count) ? (
        <ChartEmptyState />
      ) : (
        <Fade>
          <ScrollView horizontal>
            <Svg width={width} height={180} accessible={false}>
              <Line
                x1={0}
                x2={width}
                y1={zero}
                y2={zero}
                stroke={theme.border}
              />
              {data.map((d, i) => {
                const x = 12 + i * (width / data.length);
                return (
                  <React.Fragment key={d.date}>
                    <Rect
                      x={x}
                      y={y(d.income)}
                      width={19}
                      height={zero - y(d.income)}
                      rx={4}
                      fill={theme.limeText}
                      onPress={() => setSelected(d)}
                    />
                    <Rect
                      x={x + 23}
                      y={Math.min(zero, y(d.expense))}
                      width={19}
                      height={Math.abs(y(d.expense) - zero)}
                      rx={4}
                      fill={theme.coral}
                      onPress={() => setSelected(d)}
                    />
                    <SvgText
                      fontFamily="Inter_400Regular"
                      x={x + 20}
                      y={170}
                      textAnchor="middle"
                      fill={theme.muted}
                      fontSize={10}
                    >
                      {shortDate(d.date)}
                    </SvgText>
                  </React.Fragment>
                );
              })}
            </Svg>
          </ScrollView>
          {selected && (
            <Label accessibilityLiveRegion="polite">
              {shortDate(selected.date)} · Receitas{" "}
              {money(selected.income, prefs.hidden)} · Despesas{" "}
              {money(selected.expense, prefs.hidden)} · Resultado{" "}
              {money(selected.income - selected.expense, prefs.hidden)}
            </Label>
          )}
          <Label muted size={12}>
            Verde: receitas · Coral: despesas
          </Label>
          <DataList
            rows={data.map((d) => ({
              label: shortDate(d.date),
              value: `Entradas ${money(d.income, prefs.hidden)}\nSaídas ${money(d.expense, prefs.hidden)}\nResultado ${money(d.income - d.expense, prefs.hidden)}`,
            }))}
          />
        </Fade>
      )}
    </ChartCard>
  );
}
export function InstitutionSpendingChart({
  data,
  onInstitution,
}: {
  data: Breakdown[];
  onInstitution: (id: string) => void;
}) {
  const { theme, prefs } = useStore();
  const max = Math.max(1, ...data.map((d) => d.total));
  return (
    <ChartCard
      title="Gastos por instituição"
      subtitle="Selecione uma instituição para abrir as movimentações."
    >
      {!data.length ? (
        <ChartEmptyState />
      ) : (
        <Fade>
          {data.map((d) => (
            <Pressable
              accessibilityRole="button"
              key={d.id}
              onPress={() => onInstitution(d.id)}
              style={({ pressed }) => ({
                paddingVertical: 10,
                gap: 8,
                opacity: pressed ? 0.6 : 1,
              })}
            >
              <View style={s.row}>
                <Label>{d.name}</Label>
                <Label bold>{money(d.total, prefs.hidden)}</Label>
              </View>
              <View
                style={{
                  height: 8,
                  backgroundColor: theme.surface2,
                  borderRadius: 4,
                }}
              >
                <View
                  style={{
                    width: `${(Math.max(0, d.total) / max) * 100}%`,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: theme.limeText,
                  }}
                />
              </View>
            </Pressable>
          ))}
        </Fade>
      )}
    </ChartCard>
  );
}
export function BenefitsUsageChart({
  data,
  onWallet,
}: {
  data: ReturnType<import("../domain/analytics").Analytics["getBenefitsUsage"]>;
  onWallet: (id: string) => void;
}) {
  const { theme, prefs } = useStore();
  return (
    <ChartCard
      title="Consumo de benefícios"
      subtitle="Alimentação, refeição e demais carteiras permanecem separadas."
    >
      {!data.length ? (
        <ChartEmptyState message="Adicione uma carteira de benefício para acompanhar seu consumo." />
      ) : (
        <Fade>
          {data.map((d) => (
            <Pressable
              accessibilityRole="button"
              key={d.id}
              onPress={() => onWallet(d.id)}
              style={{ gap: 10, paddingVertical: 12 }}
            >
              <Label bold>
                {d.institution} · {d.name}
              </Label>
              <Label muted size={11}>
                Estimado · depende dos registros disponíveis
              </Label>
              <Label size={13}>
                {money(d.used, prefs.hidden)} utilizados ·{" "}
                {d.reference === null
                  ? "Referência incompleta"
                  : `${money(d.reference, prefs.hidden)} de referência`}
              </Label>
              {d.percent !== null && (
                <>
                  <View
                    style={{
                      height: 9,
                      borderRadius: 5,
                      backgroundColor: theme.surface2,
                    }}
                  >
                    <View
                      style={{
                        height: 9,
                        borderRadius: 5,
                        backgroundColor: theme.limeText,
                        width: `${Math.min(100, Math.max(0, d.percent))}%`,
                      }}
                    />
                  </View>
                  <Label size={12}>
                    {prefs.hidden ? "••••" : percentage(d.percent)} consumido
                  </Label>
                </>
              )}
              <Label size={13}>
                {d.remaining === null
                  ? "Saldo desconhecido"
                  : `${money(d.remaining, prefs.hidden)} de saldo estimado`}
              </Label>
            </Pressable>
          ))}
        </Fade>
      )}
    </ChartCard>
  );
}
export function MonthlyComparisonChart({
  data,
  currentMonth,
  onPeriod,
  onExpand,
}: {
  data: (Bucket & { partial: boolean; change: number | null })[];
  currentMonth: string;
  onPeriod: (start: string, end: string) => void;
  onExpand?: () => void;
}) {
  const { theme, prefs } = useStore();
  const width = Math.max(290, data.length * 56);
  const max = Math.max(1, ...data.map((d) => d.expense));
  const min = Math.min(0, ...data.map((d) => d.expense));
  const y = (value: number) => 145 - ((value - min) / (max - min)) * 120;
  const zero = y(0);
  return (
    <ChartCard
      title="Comparação mensal"
      subtitle="* Período parcial. Variações usam os mesmos dias do mês anterior."
    >
      {data.length < 2 && onExpand && (
        <>
          <Label muted size={12}>
            Selecione ao menos dois meses para visualizar uma comparação.
          </Label>
          <Action
            secondary
            title="Comparar últimos 6 meses"
            onPress={onExpand}
          />
        </>
      )}
      {!data.some((d) => d.count) ? (
        <ChartEmptyState />
      ) : (
        <Fade>
          <ScrollView horizontal>
            <Svg width={width} height={185} accessible={false}>
              <Line
                x1={0}
                x2={width}
                y1={zero}
                y2={zero}
                stroke={theme.border}
              />
              {data.map((d, i) => {
                const x = 14 + (i * width) / data.length;
                return (
                  <React.Fragment key={d.date}>
                    <Rect
                      x={x}
                      y={Math.min(zero, y(d.expense))}
                      width={28}
                      height={Math.abs(y(d.expense) - zero)}
                      rx={5}
                      fill={
                        d.expense < 0
                          ? theme.coral
                          : d.date.slice(0, 7) === currentMonth
                            ? theme.limeText
                            : theme.muted
                      }
                      onPress={() => onPeriod(d.date, d.end)}
                    />
                    <SvgText
                      fontFamily="Inter_400Regular"
                      x={x + 14}
                      y={172}
                      textAnchor="middle"
                      fill={theme.muted}
                      fontSize={10}
                    >
                      {d.date.slice(5, 7)}
                      {d.partial ? "*" : ""}
                    </SvgText>
                  </React.Fragment>
                );
              })}
            </Svg>
          </ScrollView>
          <DataList
            rows={data.map((d) => ({
              label: `${d.date.slice(0, 7)}${d.partial ? " · parcial" : ""}`,
              value: `${money(d.expense, prefs.hidden)}${d.change === null ? "" : prefs.hidden ? " · ••••" : ` · ${percentage(d.change)}`}`,
              onPress: () => onPeriod(d.date, d.end),
            }))}
          />
        </Fade>
      )}
    </ChartCard>
  );
}
