# Caxe

Aplicativo financeiro offline-first em React Native e Expo 58. A interface segue a referência [Caxu no Figma](https://www.figma.com/design/IldOIjkq0Pl5lS4x4UZK6D/?node-id=1-15), preservando o nome **Caxe**, a fonte Inter, os tokens, os assets locais e as quatro abas. Os saldos de bancos e benefícios são separados, conforme os requisitos financeiros.

O diretório fornecido estava vazio. Este projeto cria a base executável; não havia implementação anterior para reaproveitar. Não há transações de demonstração no aplicativo. Os gráficos e estados vazios usam o SQLite real.

## Executar

Requer Node 24+, npm e o ambiente nativo de desenvolvimento correspondente.

```sh
npm ci
npm run android
# ou, com Xcode e sua licença configurados:
npm run ios
npm start
```

Use um Expo Development Build. O módulo de captura Android não faz parte do Expo Go. O autolinking descobre `modules/caxe-notifications`, e o config plugin registra o NotificationListenerService com a permissão de sistema apropriada.

Prévia web para conferir a interface, também com SQLite persistente:

```sh
npm run web:build
npm run web:preview
```

Abra `http://127.0.0.1:8081`. O servidor local envia COOP/COEP para o worker/WASM do SQLite. A prévia não substitui testes em aparelhos.

## Funcionalidades

- Início com saldo bancário estimado, gastos e receitas do mês, rosca resumida, últimas movimentações e benefícios separados.
- Análise financeira acessível por **Ver análises**, com nove KPIs e os seis gráficos obrigatórios. Listas acessíveis complementam as visualizações, com drill-down para o histórico.
- Períodos predefinidos e personalizados; filtros combinados por instituição, carteira, tipo de carteira, categoria e movimentação. Persistência no SQLite e preservação na navegação.
- Histórico paginado, cadastro e detalhe de carteiras, cadastro/edição/exclusão de transações, estornos vinculados e conciliação manual de notificações de fontes diferentes.
- **Ajustes → Aparência → Ícones das movimentações**. Logos por padrão; troca imediata para categorias; temas Light/Dark/automático; privacidade dos valores.
- Categorias personalizadas com escolha de ícone e cor. Logos do Figma embarcadas para Nubank, Pluxee, Caju e Flash. Instituições sem asset local usam iniciais; falhas de imagem também usam fallback, sem requisições de logos na rede.
- Preferências e operações locais gravadas atomicamente com uma outbox. Contas diferentes usam arquivos SQLite distintos. O espaço sem conta permanece separado ao autenticar.
- Backend Hono para Cloudflare Workers, Better Auth, Drizzle e Neon PostgreSQL. Paginação de registros, isolamento por usuário, controle de versão, recibos idempotentes e revisão de conflitos financeiros.

## Backend e autenticação

O app funciona sem configurar a API. Para sincronizar, configure seu próprio banco Neon e as variáveis de ambiente. Não exponha os segredos com o prefixo `EXPO_PUBLIC_`.

1. Copie `.env.example` para `.env`, ajuste `EXPO_PUBLIC_API_URL` e defina `DATABASE_URL` no ambiente do Drizzle. Em um aparelho físico, `localhost` é o próprio aparelho: use o IP da máquina ou a URL HTTPS do Worker.
2. Execute a migration versionada: `npm run db:migrate` com `DATABASE_URL` disponível no ambiente.
3. Crie `api/.dev.vars` com `DATABASE_URL` e `BETTER_AUTH_SECRET` (ao menos 32 caracteres aleatórios). Os valores públicos de desenvolvimento ficam em `api/wrangler.jsonc`.
4. Execute `npm run api:dev`. Para a prévia web, ajuste `APP_ORIGIN` para a origem exata utilizada, incluindo o host (`127.0.0.1` e `localhost` são diferentes).
5. Para produção, configure `DATABASE_URL` e `BETTER_AUTH_SECRET` como secrets do Worker e atualize `BETTER_AUTH_URL`, `APP_ORIGIN` e `EXPO_PUBLIC_API_URL`. O projeto não publica recursos automaticamente.

As alterações visuais são síncronas no SQLite. A sincronização é posterior, com timeout, nova tentativa ao recuperar conectividade e proteção contra reconhecimento de uma operação que já foi editada. Preferências locais pendentes são rebaseadas sobre a versão remota. Conflitos de transações não sobrescrevem dados locais silenciosamente: aparecem em Ajustes com as duas versões para revisão.

## Regras financeiras

`src/domain/analytics.ts` centraliza o ledger usado por dashboard, gráficos, KPIs e histórico. Os componentes não implementam regras de soma.

| Operação confirmada e não conciliada | Despesas de consumo | Receitas | Variação de saldo acompanhado |
| --- | ---: | ---: | ---: |
| Compra/despesa | +valor | — | −valor |
| Receita | — | +valor | +valor |
| Estorno vinculado | −valor, na data do crédito e categoria da compra | — | +valor |
| Transferência própria de entrada/saída | — | — | ±valor |
| Pagamento de fatura | — | — | −valor da conta pagadora |
| Recarga de benefício | — | — | +valor da carteira de benefício |
| Pendente, excluída ou conciliada como duplicata | — | — | — |

- Dinheiro é armazenado em centavos inteiros; formatação pt-BR na interface. O ticket médio usa despesa líquida dividida pela quantidade de compras; sem compras, não há ticket.
- Identidades de eventos são únicas. Antes de salvar uma nova movimentação com o mesmo valor, tipo, carteira e dia de um registro existente, a interface exige escolher entre conciliar com o original e confirmar que se trata de outra operação. Notificações de fontes distintas não são mescladas silenciosamente por coincidência de valor ou descrição.
- Estornos precisam de uma compra confirmada, da mesma carteira, em data anterior ou igual. A soma não pode ultrapassar a compra. Uma compra com estornos não pode ser excluída, conciliada ou reduzida indevidamente.
- No PostgreSQL, essas validações e a atualização por versão ocorrem numa transação serializável, evitando sobreposição de estornos concorrentes.
- Datas de captura usam `America/Sao_Paulo`; a data contábil local fica armazenada, preservando a classificação ao viajar ou sincronizar. Períodos usam limites de datas inclusivos.
- Comparações de mês parcial usam os mesmos dias do mês anterior, limitados ao último dia daquele mês. Base anterior zero não gera percentual inventado.
- Dias sem registros não são ligados no gráfico de linha. A cobertura é sempre limitada aos registros conhecidos, não à movimentação completa do banco.
- Saldos bancários nunca incluem benefícios ou limite de crédito. O pagamento de fatura deve ser registrado na conta pagadora; a compra permanece no cartão para análise de consumo.
- Benefícios usam o saldo inicial conhecido, movimentos anteriores e recargas/ajustes do período para obter a referência. Referências desconhecidas, não positivas ou incompatíveis com filtros de categoria não produzem percentual. O saldo completo é identificado separadamente do consumo filtrado. Os saldos permanecem estimados porque a captura pode ser incompleta.

As consultas agregam no SQLite, com índices por data, carteira, categoria, origem e vínculo de estorno. Apenas a página atual do histórico é lida; não há recomputação do histórico inteiro em cada render. As métricas derivadas não são sincronizadas nem armazenadas como valores manuais.

## Captura Android e iPhone

**Android:** em Ajustes → Automações e capturas, busque os aplicativos instalados pelo nome, selecione as fontes autorizadas e abra as configurações de acesso do sistema. O listener ignora fontes não autorizadas e resumos de grupos. As capturas ficam numa fila nativa persistente até serem copiadas para o inbox SQLite; o reconhecimento só ocorre depois da gravação local. Revise cada captura, selecione carteira, tipo, categoria e valor e confirme. Textos com múltiplos valores não geram uma sugestão de valor.

**iPhone:** o iOS não disponibiliza a leitura de notificações de aplicativos bancários por outros apps. Não há promessa de interceptação automática. O Caxe aceita texto colado e o deep link `caxe://capture?text=...` para um Atalho com texto explicitamente fornecido pelo usuário. No Atalhos, codifique o texto para URL e use a ação “Abrir URLs”; o Caxe abre a revisão, sem salvar movimentações automaticamente. A disponibilidade de gatilhos do Atalhos depende do tipo de entrada permitido pelo iOS.

## Verificações

```sh
npm test
npm run typecheck
npm run native:bundle
npm run web:build
npm run api:check
npx expo install --check
```

Os 30 testes usam SQLite real (`node:sqlite`), arquivos persistentes temporários e PostgreSQL local via PGlite para testar a instrução SQL da API. Não necessitam de internet, Neon ou uma conta real. O registro das verificações está em [docs/verification.md](docs/verification.md).

O módulo Kotlin foi compilado separadamente com sucesso usando `./gradlew :caxe-notifications:compileDebugKotlin` no projeto Android gerado pelo Expo. O empacotamento JavaScript e essa compilação não comprovam o funcionamento em dispositivos. A integração de autenticação/sincronização em Neon e os fluxos de permissão/captura ainda precisam de validação com as credenciais e aparelhos do projeto. A máquina de desenvolvimento encontrada está com a licença do Xcode pendente.

`npm audit` reportou nove alertas moderados na cadeia de ferramentas do Expo/Drizzle (glob, minimatch e esbuild). Não foi aplicado `audit fix --force`, que propunha trocar as versões principais escolhidas. Esses alertas e os testes nativos devem ser reavaliados antes da distribuição.
