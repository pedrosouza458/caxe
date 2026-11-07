import { parseMoney } from "./model.ts";

export function parseNotification(text: string) {
  if (text.length > 8000) throw new Error("Mensagem muito longa");
  const amounts = [...text.matchAll(/R\$\s*([\d.]+,\d{2})/g)];
  // Notifications mentioning a balance, limit or several amounts need human review.
  if (amounts.length !== 1) return null;
  const amountCents = parseMoney(amounts[0]![1]!.replaceAll(".", ""));
  if (!amountCents) return null;
  const kind: "refund" | "expense" | "income" | null =
    /estorno|estornada/i.test(text)
      ? "refund"
      : /compra|comprou|pagamento aprovado/i.test(text)
        ? "expense"
        : /recebeu|recebido/i.test(text)
          ? "income"
          : null;
  return {
    amountCents,
    kind,
    title: text.replace(/\s+/g, " ").slice(0, 160),
    needsReview: true as const,
  };
}
