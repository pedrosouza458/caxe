import React, { useState } from "react";
import {
  Text,
  View,
  Pressable,
  TextInput,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import type { TextProps, ViewStyle } from "react-native";
import { Image } from "expo-image";
import {
  ShoppingCart,
  Utensils,
  Car,
  HeartPulse,
  House,
  CalendarDays,
  BookOpen,
  Ticket,
  ShoppingBag,
  ArrowLeftRight,
  ArrowDownLeft,
  Ellipsis,
} from "lucide-react-native";
import { useStore } from "./store";
import { categoryColor } from "./theme";
import { iconDescriptor } from "../domain/icons";
import { money } from "../domain/model";
import type { HistoryRow } from "../domain/analytics";

export function Label({
  children,
  muted = false,
  size = 14,
  bold = false,
  style,
  ...props
}: TextProps & { muted?: boolean; size?: number; bold?: boolean }) {
  const { theme } = useStore();
  const actualSize = StyleSheet.flatten(style)?.fontSize ?? size;
  const weight =
    StyleSheet.flatten(style)?.fontWeight ?? (bold ? "600" : "400");
  const family =
    weight === "700" || weight === "bold"
      ? "Inter_700Bold"
      : weight === "600"
        ? "Inter_600SemiBold"
        : "Inter_400Regular";
  return (
    <Text
      {...props}
      style={[
        {
          color: muted ? theme.muted : theme.text,
          fontFamily: family,
          fontSize: actualSize,
          lineHeight: actualSize * 1.4,
          fontWeight: weight,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}
export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: ViewStyle;
}) {
  const { theme } = useStore();
  return (
    <View
      style={[
        s.card,
        { backgroundColor: theme.surface, borderColor: theme.border },
        style,
      ]}
    >
      {children}
    </View>
  );
}
export function Action({
  title,
  onPress,
  secondary = false,
  selected,
  disabled = false,
}: {
  title: string;
  onPress: () => void;
  secondary?: boolean;
  selected?: boolean;
  disabled?: boolean;
}) {
  const { theme } = useStore();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled, selected }}
      aria-pressed={selected}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 46,
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: 14,
        backgroundColor: secondary
          ? selected
            ? theme.limeDark
            : theme.surface2
          : theme.lime,
        borderWidth: 1,
        borderColor: selected ? theme.limeText : theme.border,
        opacity: disabled ? 0.5 : pressed ? 0.65 : 1,
        justifyContent: "center",
      })}
    >
      <Label
        bold
        style={{
          color: secondary ? theme.limeText : theme.onAccent,
          textAlign: "center",
        }}
      >
        {title}
      </Label>
    </Pressable>
  );
}
export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry = false,
  numeric = false,
  multiline = false,
}: {
  label: string;
  value: string;
  onChangeText: (s: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  numeric?: boolean;
  multiline?: boolean;
}) {
  const { theme } = useStore();
  return (
    <View style={{ gap: 7 }}>
      <Label muted size={12}>
        {label}
      </Label>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.muted}
        autoCapitalize={secureTextEntry ? "none" : "sentences"}
        secureTextEntry={secureTextEntry}
        keyboardType={numeric ? "decimal-pad" : "default"}
        multiline={multiline}
        style={{
          minHeight: 52,
          borderWidth: 1,
          borderColor: theme.border,
          borderRadius: 14,
          padding: 14,
          fontFamily: "Inter_400Regular",
          color: theme.text,
          backgroundColor: theme.surface,
          fontSize: 15,
        }}
      />
    </View>
  );
}
export function ChartEmptyState({
  message = "Nenhuma movimentação neste período. Adicione um lançamento ou ajuste os filtros.",
}: {
  message?: string;
}) {
  return (
    <View style={{ paddingVertical: 24, gap: 8 }}>
      <Label bold>Ainda não há dados</Label>
      <Label muted>{message}</Label>
    </View>
  );
}
export function ChartCard({
  title,
  subtitle,
  children,
  loading = false,
  error,
  onRetry,
}: {
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
  loading?: boolean;
  error?: string;
  onRetry?: () => void;
}) {
  return (
    <Card>
      <Label size={18} bold accessibilityRole="header">
        {title}
      </Label>
      {subtitle && (
        <Label muted size={12}>
          {subtitle}
        </Label>
      )}
      {loading ? (
        <ActivityIndicator accessibilityLabel="Carregando dados locais" />
      ) : error ? (
        <>
          <Label>{error}</Label>
          {onRetry && <Action title="Tentar novamente" onPress={onRetry} />}
        </>
      ) : (
        children
      )}
    </Card>
  );
}
export function MetricCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <Card style={{ width: "48%", minHeight: 112 }}>
      <Label muted size={12}>
        {label}
      </Label>
      <Label size={20} bold>
        {value}
      </Label>
      {detail && (
        <Label muted size={11}>
          {detail}
        </Label>
      )}
    </Card>
  );
}
export const logos: Record<string, number> = {
  nubank: require("../../assets/figma/nubank.png"),
  pluxee: require("../../assets/figma/pluxee.png"),
  caju: require("../../assets/figma/caju.png"),
  flash: require("../../assets/figma/flash.png"),
};
const icons = {
  cart: ShoppingCart,
  utensils: Utensils,
  car: Car,
  heart: HeartPulse,
  home: House,
  calendar: CalendarDays,
  book: BookOpen,
  ticket: Ticket,
  bag: ShoppingBag,
  arrows: ArrowLeftRight,
  income: ArrowDownLeft,
  other: Ellipsis,
};
export function TransactionIcon({
  institution,
  icon,
  color,
  forceLogo = false,
  forceCategory = false,
}: {
  institution: string;
  icon?: string | null;
  color?: string | null;
  forceLogo?: boolean;
  forceCategory?: boolean;
}) {
  const { prefs, theme } = useStore();
  const [failed, setFailed] = useState<string | null>(null);
  const descriptor = iconDescriptor(
    forceCategory ? "category" : forceLogo ? "institution" : prefs.iconMode,
    institution,
    { icon, color },
    Object.keys(logos),
    failed === institution,
  );
  const tint =
    descriptor.type === "category"
      ? categoryColor(descriptor.color, theme)
      : theme.muted;
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        width: 40,
        height: 40,
        borderRadius: 8,
        overflow: "hidden",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor:
          descriptor.type === "category" ? `${tint}1C` : theme.surface2,
      }}
    >
      {descriptor.type === "logo" ? (
        <Image
          source={logos[descriptor.key]}
          style={{ width: 40, height: 40 }}
          contentFit="contain"
          onError={() => setFailed(institution)}
        />
      ) : descriptor.type === "initials" ? (
        <Label bold>{descriptor.text}</Label>
      ) : (
        React.createElement(icons[descriptor.icon], {
          size: 22,
          color: tint,
          strokeWidth: 1.8,
        })
      )}
    </View>
  );
}
export function TransactionRow({
  row,
  onPress,
}: {
  row: HistoryRow;
  onPress?: () => void;
}) {
  const { prefs, theme } = useStore();
  const incoming = ["income", "refund", "transfer_in", "topup"].includes(
    row.kind,
  );
  return (
    <Pressable
      accessibilityRole={onPress ? "button" : undefined}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        gap: 12,
        paddingVertical: 14,
        alignItems: "center",
        opacity: pressed ? 0.6 : 1,
      })}
    >
      <TransactionIcon
        institution={row.institution}
        icon={row.icon}
        color={row.color}
      />
      <View style={{ flex: 1, gap: 3 }}>
        <Label bold>{row.title}</Label>
        <Label muted size={11}>
          {row.institution} · {row.walletName}
        </Label>
        <Label muted size={11}>
          {row.categoryName ?? "Pendente de classificação"} ·{" "}
          {row.localDate.split("-").reverse().join("/")}
        </Label>
      </View>
      <Label
        bold
        size={13}
        style={{
          maxWidth: "38%",
          color: incoming ? theme.limeText : theme.text,
        }}
      >
        {prefs.hidden
          ? "••••"
          : `${incoming ? "+" : "−"} ${money(row.amountCents)}`}
      </Label>
    </Pressable>
  );
}
export const s = StyleSheet.create({
  card: { borderRadius: 19, borderWidth: 1, padding: 17, gap: 12 },
  page: { padding: 20, paddingTop: 20, paddingBottom: 32, gap: 20 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  title: { fontSize: 27, fontWeight: "700", letterSpacing: -0.7 },
});
