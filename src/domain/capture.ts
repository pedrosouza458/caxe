import { parseMoney } from "./model.ts";
import { benefitIssuerTokens } from "./institutions.ts";

const ignoreAutomatic =
  /\b(saldo|limite|fatura|vencimento|fechamento|pix|transfer[êe]ncia|dep[óo]sito|rendimento|saque|boleto|estorno)\b/i;
const cardPurchase =
  /\b(compra|apple\s*pay|google\s*pay|pagamento\s+(aprovado|realizado|confirmado))\b/i;
const salaryCredit = /\b(sal[aá]rio|folha de pagamento|pagamento salarial)\b/i;
const benefitCredit =
  /\b(cr[eé]dito|carga|recarga|benef[ií]cio|vale\s+(alimenta[çc][aã]o|refei[çc][aã]o)|recebeu)\b/i;

export function parseNotification(text: string) {
  if (text.length > 8000) throw new Error("Mensagem muito longa");
  const amounts = [...text.matchAll(/R\$\s*([\d.]+,\d{2})/g)];
  // Automatic imports are deliberately narrower than manual text entry.
  if (amounts.length !== 1 || ignoreAutomatic.test(text)) return null;
  const amountCents = parseMoney(amounts[0]![1]!.replaceAll(".", ""));
  if (!amountCents) return null;
  const normalized = text.toLocaleLowerCase("pt-BR");
  const kind: "expense" | "income" | "topup" | null = cardPurchase.test(text)
    ? "expense"
    : salaryCredit.test(text)
      ? "income"
      : benefitIssuerTokens.some((issuer) => normalized.includes(issuer)) &&
          benefitCredit.test(text)
        ? "topup"
        : null;
  if (!kind) return null;
  return {
    amountCents,
    kind,
    title: text.replace(/\s+/g, " ").slice(0, 160),
    needsReview: true as const,
  };
}
