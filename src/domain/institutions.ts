// Curated Brazilian presets. Users can always type another institution.
export const bankPresets = [
  "Banco do Brasil",
  "Bradesco",
  "Caixa",
  "Itaú",
  "Santander",
  "Nubank",
  "Inter",
  "C6 Bank",
  "BTG Pactual",
  "Banco Pan",
  "PagBank",
  "Mercado Pago",
  "PicPay",
  "Neon",
  "Will Bank",
  "Sofisa Direto",
  "Sicredi",
  "Sicoob",
  "Banrisul",
  "Banco Original",
] as const;

export const benefitPresets = [
  "Alelo",
  "Ticket",
  "Pluxee",
  "VR Benefícios",
  "Caju",
  "Flash",
  "Swile",
  "iFood Benefícios",
  "Raiô",
  "Ben Visa Vale",
  "ValeCard",
  "Green Card",
  "Up Brasil",
  "CooperCard",
  "Comprocard",
  "Mega Vale",
  "Cabal Vale",
  "Banricard",
  "Sorocred",
  "Alymente",
] as const;

export const benefitIssuerTokens = benefitPresets
  .map((name) => name.toLocaleLowerCase("pt-BR"))
  .filter((name) => name.length > 3);
