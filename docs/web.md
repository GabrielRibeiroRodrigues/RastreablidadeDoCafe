# Front-end (`apps/web`)

SPA em React 19 + Vite + TypeScript strict: layout, autenticação, as telas de cadastro (Produtos, Fornecedores, Clientes e Locais) as telas de estoque (Recebimento, Lotes, Estoque e Movimentações) as de operação (Produção, Expedição e Rastreabilidade), as de qualidade (Recall, Não conformidades e Auditoria) e as de gestão (Relatórios CSV e Importação), que falam com a API por um cliente tipado gerado do OpenAPI.

## Stack

| Item          | Escolha                                                          |
| ------------- | ---------------------------------------------------------------- |
| Build/dev     | Vite 8 (`@vitejs/plugin-react`)                                  |
| Estilo        | Tailwind CSS v4 + shadcn/ui (estilo `radix-nova`, ícones Lucide) |
| Rotas         | React Router 7 (modo _data_: `createBrowserRouter`)              |
| Dados         | TanStack Query 5 + `openapi-fetch` (cliente tipado pelo OpenAPI) |
| Formulários   | React Hook Form + Zod (`@hookform/resolvers`)                    |
| Auth Cognito  | `oidc-client-ts` (Authorization Code + PKCE)                     |
| Testes        | Vitest + Testing Library + jsdom                                 |
| Compartilhado | `@traceflow/shared` (`Role`, `paths`/`ApiSchema` do contrato)    |

## Estrutura

```text
apps/web/src
├── app/            # App (providers), rotas, páginas lazy (pages.tsx), QueryClient, navegação
├── auth/           # AuthProvider, useAuth, ProtectedRoute, estratégias mock/cognito
├── components/
│   ├── catalog/    # blocos genéricos das telas de cadastro (tabela, filtros, CatalogPage...)
│   ├── form/       # campos RHF, TagInput, EntityCombobox, schemas Zod, erros da API → campos
│   ├── layout/     # AppLayout, AppSidebar, MobileNav, AppHeader, PageHeader, DetailStates
│   └── ui/         # componentes gerados pelo shadcn/ui (não editar à mão sem motivo)
├── config/env.ts   # leitura e validação (Zod) das variáveis VITE_*
├── features/       # um cadastro por pasta: api.ts, <X>Form.tsx, resource.tsx e testes
│                   # (products, suppliers, customers, locations); inventory/ = telas de estoque;
│                   # production/, shipments/ e trace/ = produção, expedição e rastreabilidade
│                   # dashboard/ = painel inicial
├── lib/            # api-client.ts (openapi-fetch), api.ts (ApiError), br.ts, masks.ts, quantity.ts
├── pages/          # login, callback do Cognito, 404, erro de rota
├── theme/          # ThemeProvider, ThemeToggle (sistema/claro/escuro)
└── test/           # setup do Vitest, mock da API (fetch), sessão de teste
```

O alias `@/` aponta para `src/` (Vite, TypeScript e `components.json` do shadcn).

Para adicionar um componente do shadcn: `pnpm dlx shadcn@latest add <nome>` dentro de `apps/web`.

## Rotas

| Rota                         | Acesso  | Conteúdo                                          |
| ---------------------------- | ------- | ------------------------------------------------- |
| `/login`                     | público | seleção de usuário (mock) ou botão Cognito        |
| `/auth/callback`             | público | conclui o login do Cognito e redireciona          |
| `/`                          | privado | Painel (indicadores, vencimentos, estoque)        |
| `/produtos`                  | privado | cadastro de produtos                              |
| `/fornecedores`              | privado | cadastro de fornecedores                          |
| `/clientes`                  | privado | cadastro de clientes                              |
| `/locais`                    | privado | cadastro de locais de estoque                     |
| `/recebimento`               | privado | novo recebimento (admin e operador)               |
| `/lotes`                     | privado | lista de lotes                                    |
| `/lotes/:id`                 | privado | detalhe do lote, ações e histórico                |
| `/estoque`                   | privado | posição de estoque (lote × local)                 |
| `/movimentacoes`             | privado | razão de movimentações                            |
| `/producao`                  | privado | ordens de produção                                |
| `/producao/nova`             | privado | nova ordem (admin e operador)                     |
| `/producao/:id`              | privado | detalhe da ordem                                  |
| `/expedicao`                 | privado | expedições                                        |
| `/expedicao/nova`            | privado | nova expedição (admin e operador)                 |
| `/expedicao/:id`             | privado | detalhe da expedição                              |
| `/rastreabilidade`           | privado | busca de lote para rastrear                       |
| `/lotes/:id/rastreabilidade` | privado | árvore para trás (origem) e para frente (destino) |
| `/recall`                    | privado | recalls (lista)                                   |
| `/recall/novo`               | privado | simulação de impacto; execução só admin           |
| `/recall/:id`                | privado | detalhe: etapas, clientes, lotes, relatório       |
| `/qualidade`                 | privado | não conformidades (lista)                         |
| `/qualidade/:id`             | privado | detalhe da NC: liberar/descartar (admin)          |
| `/auditoria`                 | privado | trilha de auditoria (admin e auditor)             |
| `/relatorios`                | privado | relatórios CSV                                    |
| `/importacao`                | privado | importação de cadastros por CSV (admin)           |
| `*`                          | privado | 404 dentro do layout                              |

Todas as páginas autenticadas são carregadas sob demanda (`React.lazy`, em `app/pages.tsx`): cada uma vira um chunk próprio e o layout mostra um esqueleto (`PageSkeleton`) enquanto o código chega. Passar o mouse (ou o foco) num link da barra lateral pré-carrega a página (`preloadRoute`).

Rotas privadas ficam sob `ProtectedRoute`: enquanto a sessão é restaurada mostra um carregando; sem sessão, redireciona para `/login` guardando a rota original, para voltar a ela após o login.

## Autenticação

`AuthProvider` expõe (via `useAuth()`):

```ts
{ mode, status, user, accessToken, isAuthenticated, login(email?), logout(), completeLogin() }
```

A estratégia é escolhida por `VITE_AUTH_MODE` — ver [ADR 0005](adr/0005-auth-cognito-mock-issuer.md).

### Modo `mock` (padrão em desenvolvimento)

1. A tela de login chama `GET {VITE_API_URL}/v1/dev/users` e lista os usuários de desenvolvimento.
2. Ao clicar (ou informar um e-mail), chama `POST {VITE_API_URL}/v1/dev/token` com `{ "email": "..." }`.
3. O token fica em memória e em `sessionStorage` (chave `traceflow.auth.session`); ao recarregar a página a sessão é restaurada se o `exp` ainda for válido. Falhas de acesso ao `sessionStorage` são ignoradas (a sessão fica só em memória).
4. Se a API estiver fora do ar, a tela mostra "API indisponível" com botão para tentar novamente.

### Modo `cognito`

- `oidc-client-ts` com `response_type=code` (PKCE automático) e Hosted UI/Managed Login.
- O retorno chega em `/auth/callback` (`VITE_COGNITO_REDIRECT_URI`), que troca o `code` pelos tokens.
- O usuário OIDC fica em `sessionStorage` (store do `oidc-client-ts`).
- Logout: remove o usuário local e redireciona para `{VITE_COGNITO_DOMAIN}/logout?client_id=...&logout_uri=...` (o Cognito não publica `end_session_endpoint`).
- Ainda não testado contra um User Pool real (será criado na Semana 6 ou antes, com autorização).

### Perfis

Os perfis (`admin`, `operator`, `auditor`) vêm do claim `cognito:groups` do **access token**, decodificado no cliente **sem verificar assinatura** — serve só para a UI. Quem autoriza de verdade é a API.

| Perfil   | Na UI dos cadastros                                    |
| -------- | ------------------------------------------------------ |
| auditor  | somente leitura (sem "Novo", "Editar" nem "Desativar") |
| operator | cria e edita                                           |
| admin    | cria, edita, desativa e reativa                        |

As regras ficam em `auth/permissions.ts` (`useCatalogPermissions`); a API aplica as mesmas.

| Perfil   | Nas telas de estoque (`useInventoryPermissions`)                                         |
| -------- | ---------------------------------------------------------------------------------------- |
| auditor  | somente leitura (`/recebimento` mostra aviso; sem botões de ação no lote)                |
| operator | recebe, movimenta (saída, transferência, consumo), edita dados, anexa, põe em quarentena |
| admin    | tudo do operador + ajuste de inventário, estorno, bloquear e liberar o lote              |

### Empresa no cabeçalho

O cabeçalho mostra a empresa de `GET /v1/me` (`useMe`, em `auth/use-me.ts`) nos **dois** modos de login — no Cognito o token não traz a empresa. O nome vindo do login mock é só o valor inicial.

### Sessão expirada

Se uma chamada autenticada recebe **401**, o `AuthProvider` descarta só a sessão local (`clearSession` da estratégia — no Cognito não passa pelo logout do Hosted UI), limpa o cache, mostra o toast "Sua sessão expirou" e o `ProtectedRoute` leva ao login guardando a página atual (com query string). O login exibe o aviso "Sua sessão expirou" e, ao entrar, volta para a mesma página.

## Chamadas à API (cliente tipado)

`src/lib/api-client.ts` cria um cliente [`openapi-fetch`](https://openapi-ts.dev/openapi-fetch/) tipado com os `paths` gerados do OpenAPI (`@traceflow/shared`, regenerados com `pnpm openapi` na raiz). Rotas, parâmetros, corpos e respostas são verificados pelo TypeScript:

```ts
const page = await unwrap(
  getApiClient().GET('/v1/products', { params: { query: { q: 'bourbon' } }, signal }),
);
```

Um middleware único:

- injeta `Authorization: Bearer <token>` (lido de `apiSession`, mantido pelo `AuthProvider`), `x-request-id` (`crypto.randomUUID()`) e `Accept`;
- **lança** respostas não-2xx como `ApiError` (`src/lib/api.ts`), lido do RFC 9457: `status`, `type`, `title`, `detail`, `requestId` e `errors: [{ field, messages: string[] }]`;
- converte falha de rede em `ApiError` com `status: 0` (cancelamentos do TanStack Query passam intactos);
- em 401 de chamada autenticada, avisa o `AuthProvider`.

`unwrap()` devolve só o `data`. `getErrorMessage()` traduz o status para pt-BR (400, 401, 403, 404, 409 e 5xx com o `requestId`) e `translateFieldMessage()` traduz as mensagens mais comuns do class-validator ("must be unique" → "Já existe um cadastro com este valor.").

O `ApiError` guarda também os campos extras do problema (`extensions`, ex.: `available`, `location`). Problemas de domínio têm mensagem própria, escolhida pelo `type` antes do status:

| `type`                             | Mensagem                                                            |
| ---------------------------------- | ------------------------------------------------------------------- |
| `/problems/insufficient-stock`     | "Saldo insuficiente em ARM-01: disponível 40,000"                   |
| `/problems/lot-not-movable`        | "Lote em quarentena/bloqueado não pode ser movimentado"             |
| `/problems/already-reversed`       | "Esta movimentação já foi estornada."                               |
| `/problems/invalid-reversal`       | estorno de estorno                                                  |
| `/problems/idempotency-key-reused` | mesma chave com outro corpo                                         |
| `/problems/invalid-movement`       | motivo do ajuste, origem = destino, ajuste com os dois lados        |
| `/problems/lot-consumed` e outros  | lote consumido, produto inativo, destino inativo                    |
| `/problems/invalid-production`     | `detail` traduzido (saída > entrada, etapa × tipo, produto inativo) |
| `/problems/invalid-shipment`       | par (lote, local) repetido na expedição                             |
| `/problems/inactive-customer`      | cliente inativo não recebe expedições                               |

O QueryClient não repete consultas que falharam com 4xx. No logout o cache do TanStack Query é limpo, para não exibir dados de uma empresa a outro usuário.

> Lacunas atuais do OpenAPI gerado, contornadas com _cast_ comentado no front: `page`/`pageSize` das listagens e `description` de produto aparecem como objeto (faltam `type: Number`/`type: String` nos DTOs da API).

## Telas de cadastro

As quatro telas são a mesma `CatalogPage` (`components/catalog/CatalogPage.tsx`), configurada pelo `resource.tsx` de cada pasta em `features/`:

| Tela         | Busca (`q`)              | Filtros  | Ordenação    | Colunas                                          |
| ------------ | ------------------------ | -------- | ------------ | ------------------------------------------------ |
| Produtos     | nome, SKU                | tipo     | SKU, nome    | SKU, nome/descrição, tipo, unidade, torra padrão |
| Fornecedores | nome, fazenda, documento | tipo, UF | nome         | nome/fazenda, tipo, CPF/CNPJ, origem, variedades |
| Clientes     | nome, documento, e-mail  | UF       | nome         | nome, CPF/CNPJ, contato, cidade/UF               |
| Locais       | código, nome             | tipo     | código, nome | código, nome/descrição, tipo                     |

Todas têm a coluna **Situação** (Ativo/Inativo) e o filtro **Ativos / Inativos / Todos**. Não há exclusão: cadastros são desativados (com confirmação) e podem ser reativados.

### Estado na URL

Página, tamanho da página, busca, filtros, situação e ordenação ficam na query string (`/produtos?q=bourbon&type=GREEN&sort=-sku&page=2`): recarregar, voltar/avançar e compartilhar o link preservam a tela. Valores padrão não aparecem na URL, valores inválidos são ignorados, qualquer mudança que não seja de página volta para a página 1 e a digitação na busca usa `replace` para não encher o histórico.

### Blocos reutilizáveis (`components/catalog` e `components/form`)

| Bloco                           | O que faz                                                                          |
| ------------------------------- | ---------------------------------------------------------------------------------- |
| `useListParams`                 | lê e escreve o estado da listagem na URL                                           |
| `DataTable`                     | cabeçalho ordenável (`aria-sort`), esqueleto, vazio, erro com "Tentar novamente"   |
| `PaginationBar`                 | "1–20 de 45", página anterior/próxima e itens por página (10/20/50/100)            |
| `SearchInput`                   | busca com _debounce_ de 300 ms                                                     |
| `FilterSelect` / `StatusFilter` | filtros por valor e por situação                                                   |
| `ConfirmDialog`                 | confirmação que só fecha quando a ação termina                                     |
| `TextField`, `SelectField`...   | campos React Hook Form com rótulo, descrição e erro                                |
| `TagInput` / `TagsField`        | lista de textos (variedades): Enter ou vírgula adiciona, Backspace remove          |
| `applyApiErrors`                | leva `errors[].field` da API para os campos; o resto vira erro geral do formulário |
| `schemas.ts`                    | peças Zod comuns: nome, CPF/CNPJ, e-mail, telefone, UF                             |

Os formulários validam no cliente com Zod (mesmas regras da API) antes de enviar. Erros da API voltam para o campo: SKU/código duplicado (**409**) e validação (**400**) aparecem no campo; 403, rede e 5xx aparecem num alerta no topo do formulário, além do toast.

### Formatos brasileiros (`lib/br.ts`)

- **CPF/CNPJ**: o campo aceita com ou sem pontuação, valida os dígitos verificadores (mesma regra da API) e envia só dígitos; a tabela mostra formatado (`529.982.247-25`, `11.222.333/0001-81`).
- **Telefone**: aceita pontuação, envia só dígitos (10 a 13) e é exibido como `(11) 98888-7777`.
- **UF**: select com as 27 unidades federativas.
- Campos opcionais vazios são enviados como `null`.

## Telas de estoque (`features/inventory`)

Contrato da API em [estoque.md](estoque.md) e [anexos.md](anexos.md). A barra lateral ganhou a seção **Estoque** (Lotes, Estoque, Movimentações); a seção **Operação** (Produção, Expedição e Rastreabilidade) veio na Semana 3; **Qualidade** (Recall, Qualidade, Auditoria) e **Gestão** (Relatórios, Importação) vieram depois.

### Recebimento (`/recebimento`)

Formulário em duas partes:

- **Recebimento**: produto (busca no servidor, só ativos, mostra SKU e unidade), fornecedor (busca, opcional), local de destino (select com o tipo; escolher um local de quarentena avisa que o lote nasce em quarentena), quantidade na unidade do produto, data/hora (padrão: agora), NF/documento e validade.
- **Qualidade**: safra, variedade, altitude, peneira (8–20), umidade %, pontuação SCA (0–100), grau de torra e observações. Mesmas faixas da API; aceitam vírgula decimal.

O envio leva `Idempotency-Key`. Ao sucesso: toast "Lote CAF-… recebido" e navegação para o detalhe do lote.

### Lotes (`/lotes`)

Tabela com código (link), produto, fornecedor/fazenda, saldo e quantidade inicial, data de recebimento, validade e status (Disponível, Quarentena, Bloqueado, Consumido). Validade **vencida** em vermelho e **vencendo em até 30 dias** em âmbar. Filtros: busca por código, produto, status e "vencendo em N dias" (7/15/30/60/90); ordenação por código, recebimento e validade; tudo na URL (`/lotes?lotStatus=QUARANTINE&expiresWithinDays=30`). Lotes consumidos aparecem esmaecidos.

### Detalhe do lote (`/lotes/:id`)

- Cabeçalho: código, status, produto, fornecedor/fazenda.
- Cartões: saldo atual × quantidade inicial e data de recebimento; validade (com dias restantes); qualidade.
- **Saldo por local** e **Anexos** (lista, upload e download — ver abaixo).
- **Histórico de movimentações** (`GET /v1/movements?lotId=`, até 100 mais recentes): data, tipo, origem → destino, quantidade, usuário, documento, motivo e o selo **Estornada** (linha esmaecida). Link para a tela de Movimentações já filtrada pelo lote.

Ações conforme o perfil:

| Ação           | Quem            | Detalhes                                                                                                                                                        |
| -------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Movimentar     | admin, operador | Saída, Transferência, Consumo e Ajuste (só admin: perda na origem ou sobra no destino, motivo obrigatório). Origem só entre locais com saldo, com o disponível. |
| Estornar       | admin           | Por linha do histórico; não aparece em estornos nem em movimentações já estornadas. Motivo obrigatório.                                                         |
| Alterar status | admin, operador | Operador só põe em quarentena; admin escolhe Disponível/Quarentena/Bloqueado. Motivo obrigatório. Oculto em lote consumido.                                     |
| Editar dados   | admin, operador | Validade e qualidade (`PATCH /v1/lots/:id`); campo vazio limpa o valor.                                                                                         |

O diálogo de movimentação valida no cliente (quantidade ≤ disponível na origem, origem ≠ destino), mas o resultado da API sempre prevalece: se o saldo mudou por outro usuário, o 409 aparece no topo do diálogo ("Saldo insuficiente em ARM-01: disponível 10,500") e os saldos são recarregados. Lote em quarentena ou bloqueado mostra um aviso e o erro da API (`lot-not-movable`).

**Anexos**: PDF, JPEG, PNG ou WebP até 10 MB. O navegador pede o formulário pré-assinado (`POST /v1/lots/:id/attachments`), envia o arquivo direto ao bucket (campos primeiro, arquivo por último) e confirma (`/confirm`). O download abre a URL pré-assinada numa nova aba. Sem armazenamento configurado (503), o cartão avisa.

### Estoque (`/estoque`)

`GET /v1/stock`: uma linha por lote × local com lote (link), produto, local e tipo, quantidade com unidade, validade (mesmo destaque) e status do lote. Filtros: busca pelo código, produto, local e status do lote, na URL.

### Movimentações (`/movimentacoes`)

`GET /v1/movements` paginado, mais recentes primeiro: data, tipo, lote (link), origem → destino, quantidade, usuário, documento e motivo. Filtros: tipo, local (origem ou destino), período (de/até em dias locais; "até" inclui o dia) e lote (`?lotId=`, removível).

### Quantidades, datas e idempotência

- `lib/quantity.ts`: a API usa string decimal com ponto (`"1250.500"`); a tela mostra `1.250,5 kg`. Campos aceitam vírgula (`1250,5` → `"1250.5"`), até 3 casas. Comparações usam milésimos em `bigint` (sem erro de ponto flutuante). Unidades: `kg`, `sc` (saca de 60 kg) e `un`.
- Datas só-dia (`expiresAt`) são lidas como data local, sem o deslocamento de fuso do `new Date("AAAA-MM-DD")`.
- `useIdempotencyKey`: uma chave (`crypto.randomUUID()`) por envio; repetir o mesmo corpo (ex.: após erro de rede) reaproveita a chave e a API devolve o resultado original em vez de lançar de novo. Corpo diferente → chave nova; sucesso → descarta.
- Qualquer mudança no razão invalida as consultas `lots`, `movements` e `stock`.

### Rótulos

| Tipo          | Rótulo        | Status       | Rótulo     |
| ------------- | ------------- | ------------ | ---------- |
| `RECEIPT`     | Entrada       | `AVAILABLE`  | Disponível |
| `ISSUE`       | Saída         | `QUARANTINE` | Quarentena |
| `TRANSFER`    | Transferência | `BLOCKED`    | Bloqueado  |
| `ADJUSTMENT`  | Ajuste        | `CONSUMED`   | Consumido  |
| `CONSUMPTION` | Consumo       |              |            |
| `PRODUCTION`  | Produção      |              |            |
| `REVERSAL`    | Estorno       |              |            |

### Lacunas da API percebidas pelo front

- `GET /v1/lots` só busca pelo código (não por produto/fornecedor em texto); `GET /v1/movements` não tem ordenação nem filtro por usuário.
- `GET /v1/stock` não ordena nem devolve um `id` de linha (o front usa `lote:local`).
- Resolvidas na integração: `MovementResponse` passou a trazer `unit`; o problema `lot-not-movable` traz o status do lote em `lotStatus` (antes era `status`, sobrescrito pelo código HTTP).

## Produção, expedição e rastreabilidade (Semana 3)

Contrato da API em [producao-rastreabilidade.md](producao-rastreabilidade.md) e [expedicao.md](expedicao.md). Código em `features/production`, `features/shipments` e `features/trace`. Permissões: as mesmas do estoque (`useInventoryPermissions().canOperate`) — o auditor não vê "Nova ordem" nem "Nova expedição", e as rotas `/nova` mostram um aviso de somente leitura.

### Produção (`/producao`)

Lista paginada: número (link), etapa, lote gerado (link + produto), nº de insumos, rendimento (torra fora de 75–90% em âmbar), perda em kg, data e usuário. Filtros na URL: busca (número da OP ou código do lote gerado), etapa e período (`from`/`to` em dias locais, como em Movimentações — bloco `PeriodFilter`).

**Nova ordem** (`/producao/nova`), em três passos:

1. **Etapa**: cartões Beneficiamento, Torra, Blend e Embalagem com uma linha de explicação. Trocar a etapa limpa insumos e produto.
2. **Insumos**: linhas com um `StockLotPicker` (saldos de `/v1/stock` de lotes disponíveis, filtrados no cliente pelos tipos aceitos na etapa; mostra lote, produto, local e disponível) e a quantidade (≤ disponível, validada no cliente). Um par (lote, local) já escolhido some das outras linhas. Até 20 insumos.
3. **Saída**: produto (só tipos aceitos como saída), local, quantidade, data, dados opcionais do lote (validade, pontuação SCA, grau de torra — só para torrado/blend, com o padrão do produto —, observações) e observações da ordem.

| Etapa          | Insumos                   | Saída            |
| -------------- | ------------------------- | ---------------- |
| Beneficiamento | café verde                | café verde       |
| Torra          | café verde                | torrado          |
| Blend          | torrado, blend            | blend            |
| Embalagem      | torrado, blend, embalagem | torrado ou blend |

O cartão **Balanço de massa** (fixo à direita no desktop, antes dos botões no celular) mostra ao vivo a massa de entrada e de saída em kg (1 saca = 60 kg; embalagens e quantidades em unidades ficam fora, como na API), o rendimento e a perda estimados; avisa se a torra sai de 75–90% e bloqueia saída maior que a entrada. O envio leva `Idempotency-Key` (`useIdempotencyKey`); ao sucesso: toast "OP-… concluída — lote CAF-… gerado" e navegação para o detalhe.

**Detalhe** (`/producao/:id`): etapa, data e usuário; balanço (entrada, saída, rendimento, perda) e observações; cartão do lote gerado (link, tipo, status, quantidade); tabela de insumos consumidos com links; botão para a rastreabilidade do lote gerado.

### Expedição (`/expedicao`)

Lista paginada: número (link), cliente, pedido/NF, nº de itens, data e usuário. Filtros na URL: busca (número ou pedido/NF), cliente, lote (combobox sobre `/v1/lots`, `?lotId=`) e período.

**Nova expedição** (`/expedicao/nova`): cliente (combobox, só ativos), pedido/NF, data/hora (padrão: agora), itens (lote × local de lotes disponíveis via `StockLotPicker`, quantidade ≤ disponível; até 50) e observações. `Idempotency-Key` por envio. Erros da API (saldo insuficiente, lote não movimentável, par repetido, cliente inativo) aparecem no topo do formulário e no toast; um 409 recarrega os saldos.

**Detalhe** (`/expedicao/:id`): cliente (documento, cidade/UF, link para as outras expedições dele), pedido/NF e observações, itens com link para o lote e um aviso: a correção é feita pelo estorno da saída do item no histórico do lote (o estorno mantém o número `EXP-…` como documento).

### Rastreabilidade (`/rastreabilidade` e `/lotes/:id/rastreabilidade`)

- `/rastreabilidade`: busca pelo código (ou parte dele). Código exato vai direto para a árvore; senão, lista até 10 lotes para escolher.
- O detalhe do lote tem o botão **Rastreabilidade** no cabeçalho.
- Duas abas (`?aba=destino` na URL para a segunda): **Para trás (origem)** e **Para frente (destino)**.
- Resumo no topo: para trás — nº de origens/fazendas, lotes de origem e ordens de produção; para frente — nº de **clientes afetados** ("Clientes que receberam produto derivado deste lote"), expedições e lotes derivados.
- Aviso **Grafo truncado** quando a API corta a profundidade (`truncated`).

**Árvore visual** (`TraceTree` + `layout.ts`): colunas por profundidade — para trás, fazendas à esquerda e o lote consultado à direita; para frente, o lote à esquerda e as expedições/clientes à direita. Cartões de lote (código, quantidade inicial, produto, tipo, status, safra/variedade; clicar abre a rastreabilidade daquele lote), de fazenda (nome, produtor, região, cidade/UF, altitude) e de expedição (cliente, cidade/UF, `EXP-…`, data, quantidade e lote). As ligações são curvas SVG com rótulo (quantidade na unidade do lote de origem + número da OP + etapa; "Recebimento"/"Expedido" nas pontas, tracejadas); as que tocam o lote consultado ficam em destaque.

Como funciona: `layout.ts` monta colunas e ligações a partir de `nodes`/`edges` (+ `supplier` dos nós ou `shipments`) e ordena cada coluna pela posição média dos vizinhos (baricentro), partindo da coluna do lote consultado, para reduzir cruzamentos. As colunas são uma grade CSS comum; depois do layout, as posições dos cartões são medidas no DOM (`getBoundingClientRect`, refeito com `ResizeObserver`) e as curvas e rótulos são desenhados por cima. Em telas estreitas a árvore rola na horizontal dentro do próprio contêiner (a página não). Abaixo da árvore: tabela das fazendas de origem ou das expedições (base do recall).

### Lacunas da API percebidas nas telas da Semana 3

- `GET /v1/stock` não filtra por tipo de produto: o seletor de insumos busca até 100 saldos disponíveis e filtra no cliente (com muitos lotes, pode ser preciso digitar o código).
- `GET /v1/production-orders` e `GET /v1/shipments` não ordenam nem filtram por usuário; a listagem de produção não filtra por lote de insumo.
- `ProductionOrderResponse` não traz os locais dos insumos nem o local de saída; `TraceNode` não traz o saldo atual do lote.
- Os `detail` de `/problems/invalid-production` vêm em inglês: o front traduz os casos conhecidos por expressão regular (frágil se a mensagem mudar).

## Recall, qualidade, auditoria, relatórios e importação

Contrato da API em [recall-qualidade-auditoria.md](recall-qualidade-auditoria.md) e [relatorios-importacao.md](relatorios-importacao.md). Código em `features/recalls`, `features/quality`, `features/audit`, `features/alerts`, `features/reports` e `features/imports`. Permissões em `auth/permissions.ts` (`useQualityPermissions`):

| Perfil   | Recall                           | Não conformidade       | Auditoria | Relatórios | Importação |
| -------- | -------------------------------- | ---------------------- | --------- | ---------- | ---------- |
| admin    | simula, executa, retoma, encerra | abre, libera, descarta | vê        | baixa      | importa    |
| operator | simula                           | abre                   | —         | baixa      | —          |
| auditor  | simula                           | só leitura             | vê        | baixa      | —          |

### Recall (`/recall`)

- **Lista**: número (link), lote de origem (link), motivo, severidade, status com barra de progresso das 3 etapas (deduzida do status: a listagem não traz as etapas), nº de lotes e de clientes, data e usuário. Filtros na URL: status (`?recallStatus=`) e lote de origem (`?lotId=`). A lista se atualiza a cada 3 s enquanto houver recall em execução.
- **Novo recall** (`/recall/novo`, aceita `?lotId=`): 1) lote de origem (busca pelo código) → **Simular impacto** (`POST /v1/recalls/simulate`, não grava nada): totais (lotes afetados, saldo a bloquear, já expedido, clientes), tabela de lotes afetados (nível, status, saldo), clientes a contatar com as expedições (número, data, lote, quantidade) e fazendas de origem; aviso se o grafo foi truncado. 2) **Executar** (só admin): motivo (≥ 5 caracteres) e severidade (Baixa/Média/Alta, em cartões) → diálogo de confirmação forte: o botão só habilita depois de **digitar o código do lote**. Trocar o lote descarta a simulação.
- **Detalhe** (`/recall/:id`): status e severidade no cabeçalho; linha do tempo das etapas (Bloquear lotes → Gerar relatório → Notificar) com status, tentativas, início/fim e erro; motivo e datas; clientes a contatar em cartões (e-mail/telefone clicáveis, expedições com data e quantidade — vindas da rastreabilidade para frente do lote de origem) com **Copiar lista** (texto pronto para e-mail); lotes afetados (status anterior → atual, bloqueado em, saldo na abertura). Ações: **Relatório PDF** (URL pré-assinada numa nova aba), **Tentar de novo** (recall `FAILED`) e **Encerrar** (notas obrigatórias, ≥ 5 caracteres). Enquanto `OPEN`/`EXECUTING` (Step Functions), a página consulta a API a cada 2,5 s.

### Qualidade (`/qualidade`)

- **Lista** de não conformidades: número (link), lote (link + status), tipo, descrição, status (Aberta/Liberada/Descartada) e abertura (data e usuário). Filtros: status (`?ncStatus=`), tipo e lote.
- **Abrir NC** (admin e operador): pela lista ou pelo botão **Abrir não conformidade** do detalhe do lote (lote já fixado). Lote, tipo (Umidade, Defeitos, Contaminação, Pragas, Embalagem, Outro) e descrição; avisa quando o lote não está disponível (a NC é registrada e o status é mantido). O detalhe do lote mostra um aviso com as NCs abertas.
- **Detalhe** (`/qualidade/:id`): descrição, lote com saldo atual; resolução (quem, quando, justificativa). Admin: **Liberar** e **Descartar** com justificativa; o descarte mostra quanto será baixado e de quais locais.

### Auditoria (`/auditoria`)

Tabela paginada (admin e auditor; os demais veem "Acesso restrito"): data, usuário (clicar filtra por ele), ação traduzida (`lot.status_changed` → "Status do lote alterado"; ações desconhecidas aparecem com a chave), registro (tipo + "Abrir registro" para lote, recall, NC, ordem de produção e expedição) e ID da requisição. Clicar na linha mostra **antes × depois** campo a campo, com os campos alterados em destaque. Filtros na URL: tipo de registro, ação (exata ou grupo, ex.: `recall.`), usuário, período e `entityId`. A lista de usuários do filtro sai das 100 entradas mais recentes (a API não lista usuários).

### Alertas de validade

- **Sino** no cabeçalho com o número de lotes com saldo vencendo em 30 dias (`GET /v1/alerts/expiring`, cache de 5 min); vermelho se há vencidos. Leva a `/lotes?vencendo=30`.
- **Lotes**: chips **Todos os lotes** / **Vencendo (N)**. A visão "Vencendo" usa o endpoint de alertas (só lotes com saldo, inclui vencidos, mais urgentes primeiro), com janela de 7 a 90 dias. O cartão "Vencendo em 30 dias" do painel leva para ela.

### Relatórios (`/relatorios`)

Um cartão por CSV (Estoque, Movimentações, Produção, Expedições) com os filtros de cada rota (produto, tipo, local, status; tipo de movimentação; etapa; cliente; período em dias locais, "até" inclusivo). **Baixar CSV** usa `fetch` com o Bearer (`lib/download.ts`), salva o blob com o nome do `Content-Disposition` e avisa se veio `X-Report-Truncated: true` (limite de 20.000 linhas).

### Importação (`/importacao`, admin)

1. Escolha do cadastro (Produtos, Fornecedores, Clientes, Locais) com as colunas documentadas (obrigatórias marcadas) e **Baixar modelo** (CSV gerado no navegador, com BOM e `;`).
2. Arquivo (até 2 MB, checado no cliente): ao escolher, roda o **dry run** (`?dryRun=true`, multipart).
3. Resultado: linhas, válidas, com erro e a tabela linha × campo × problema (mensagens traduzidas). **Importar** só habilita com zero erros; ao terminar, resumo com link para o cadastro.

### Lacunas da API percebidas

- `GET /v1/recalls` não traz as etapas (o progresso na lista é deduzido do status) nem filtra por período.
- `RecallCustomerResponse` traz só os números das expedições: datas e quantidades vêm de `GET /v1/lots/:id/trace/forward`.
- `ExpiringLot` no OpenAPI não declara `status`, `daysToExpiry` e `expired`, que a API já devolve (tipados à mão em `features/alerts/api.ts`).
- Não há rota de usuários para o filtro da auditoria.

## Testes

Vitest + Testing Library com `fetch` simulado (`test/mock-api.ts`, roteador por método e caminho, com `:id`) e sessão por perfil (`test/session.ts`). Cobrem: cliente tipado (headers, erros, 401, rede), listagem com paginação, busca/ordenação/situação na URL e na query, erro com retry, erros de campo 409 e 400, validação no cliente, edição, desativação com confirmação, permissões de auditor e operador, empresa via `/v1/me` e o formulário de fornecedor (CPF/CNPJ, variedades, telefone).

## Variáveis de ambiente

Copie `apps/web/.env.example` para `apps/web/.env.local`.

| Variável                    | Obrigatória    | Padrão                  | Descrição                                           |
| --------------------------- | -------------- | ----------------------- | --------------------------------------------------- |
| `VITE_API_URL`              | não            | `http://localhost:3000` | URL base da API                                     |
| `VITE_AUTH_MODE`            | não            | `mock`                  | `mock` ou `cognito`                                 |
| `VITE_COGNITO_AUTHORITY`    | modo `cognito` | —                       | `https://cognito-idp.<região>.amazonaws.com/<pool>` |
| `VITE_COGNITO_CLIENT_ID`    | modo `cognito` | —                       | app client público (sem secret)                     |
| `VITE_COGNITO_REDIRECT_URI` | modo `cognito` | —                       | ex.: `http://localhost:5173/auth/callback`          |
| `VITE_COGNITO_LOGOUT_URI`   | modo `cognito` | —                       | ex.: `http://localhost:5173/login`                  |
| `VITE_COGNITO_DOMAIN`       | modo `cognito` | —                       | `https://<prefixo>.auth.<região>.amazoncognito.com` |

As variáveis são validadas com Zod na inicialização; no modo `cognito`, faltar qualquer uma delas gera erro explícito. Tudo que tem prefixo `VITE_` vai para o bundle público — **nunca** coloque segredos aqui.

## Scripts

Na raiz: `pnpm --filter @traceflow/web <script>`.

| Script       | O que faz                                |
| ------------ | ---------------------------------------- |
| `dev`        | servidor de desenvolvimento (porta 5173) |
| `build`      | `tsc -b` + build de produção em `dist/`  |
| `preview`    | serve o `dist/` localmente               |
| `typecheck`  | `tsc -b` (app + `vite.config.ts`)        |
| `test`       | Vitest uma vez                           |
| `test:watch` | Vitest em modo observação                |

Antes de rodar o front, compile o pacote compartilhado: `pnpm --filter @traceflow/shared build`.

## Painel (`/`)

Página inicial (`features/dashboard`). Indicadores em cartões clicáveis (lotes disponíveis/quarentena/bloqueados, movimentações do dia, produção e expedições dos últimos 30 dias), lista "Vencendo em 30 dias" (vencidos em vermelho), "Estoque por produto" (barras horizontais em CSS puro, proporcionais à massa em kg; itens em unidades ficam numa lista à parte) e "Movimentações recentes". As ações rápidas mudam com o perfil: admin/operador veem Novo recebimento, Nova ordem e Nova expedição; o auditor vê Ver estoque e Rastrear lote.

Os dados vêm de `GET /v1/dashboard`. Enquanto o endpoint não estiver no contrato OpenAPI, o tipo é escrito à mão em `features/dashboard/api.ts` (`TODO(openapi)`); se a API responder **404**, o painel monta os mesmos números com as listagens existentes (lotes, movimentações, estoque, produção e expedições — agregados limitados a 100 registros por listagem).

## Design system

### Tokens

Cores em OKLCH em `src/index.css`, sempre por token (nunca cor fixa no componente):

| Token                              | Uso                                                       |
| ---------------------------------- | --------------------------------------------------------- |
| `background`, `foreground`, `card` | superfícies e texto                                       |
| `primary`                          | marrom "café" (claro) / caramelo (escuro): ação principal |
| `muted`, `muted-foreground`        | fundos neutros e texto secundário                         |
| `accent`                           | hover e fundo de ícones                                   |
| `destructive`                      | erro, bloqueado, estorno                                  |
| `success`, `warning`, `info`       | estados (disponível, quarentena/vencendo, informativo)    |
| `sidebar-*`                        | barra lateral espresso (igual nos dois temas)             |
| `chart-1…5`                        | gráficos (o painel usa só `chart-1`: uma série, um tom)   |

### Tema claro/escuro

`theme/ThemeProvider.tsx` guarda a escolha (Sistema, Claro ou Escuro) em `localStorage` (`traceflow.theme`, com `try/catch`) e aplica a classe `.dark` no `<html>`. Um script inline no `index.html` aplica o tema antes do primeiro paint (sem "flash"). O botão fica no cabeçalho e na tela de login; o toast (Sonner) segue o tema.

### Layout

- **Barra lateral** (md+): seções Visão geral · Operação · Estoque · Qualidade · Cadastros · Gestão; recolhível para só ícones (escolha salva em `localStorage`). "Recebimento" só aparece para quem opera o estoque; itens com `roles` em `app/navigation.ts` só aparecem para esses perfis (Auditoria: admin e auditor; Importação: admin). O selo "Em breve" (`soon`) continua disponível para módulos futuros.
- **Celular**: botão "hambúrguer" no cabeçalho abre a mesma navegação numa gaveta (`components/ui/sheet.tsx`).
- **Cabeçalho**: empresa, selo "Ambiente de desenvolvimento" (só com `VITE_AUTH_MODE=mock`), tema e menu do usuário (perfil e empresa).
- Conteúdo com `max-w-7xl` e respiro `px-4 → px-8`; link "Pular para o conteúdo" para teclado.

### Padrões de página

- **`PageHeader`** (`components/layout/PageHeader.tsx`) em toda página: trilha (`breadcrumbs`), título `h1`, descrição, selos (`badges`) e ações. Também define o `document.title` ("Lotes · TraceFlow"). Códigos (lote, OP, EXP) usam `mono`.
- **Detalhe**: `DetailPageSkeleton` enquanto carrega e `DetailPageError` em erro (404 vira "não encontrado" com atalho para a lista — a API responde 404 também para registros de outra empresa).
- **Listas**: `DataTable` com cabeçalho fixo (a tabela rola dentro do cartão), hover na linha, esqueleto ao carregar e, abaixo de 768 px, lista de cartões (a primeira coluna — ou a marcada `mobile: 'title'` — vira o título; `mobile: 'hidden'` esconde).
- **Vazio**: `EmptyState` (ícone + título + texto de ajuda + ação principal); com filtros, a ação é "Limpar filtros".
- **Erro**: `ErrorState` com mensagem amigável, ID da requisição (erros 5xx) e "Tentar novamente".
- **Cadastros somente leitura**: o botão "Ver detalhes" (olho) abre a ficha completa numa gaveta (`CatalogDetailSheet`), com datas de criação/alteração; quem pode editar tem o botão "Editar" ali mesmo.

### Formulários

- Máscaras em `lib/masks.ts`, aplicadas pelo `TextField` (`mask`): CPF/CNPJ (vira CNPJ a partir do 12º dígito), telefone com DDD, decimal pt-BR (vírgula; ponto digitado vira vírgula; colar `1.250,5` funciona) e inteiro. `suffix` mostra a unidade dentro do campo.
- Botão de envio desabilitado e com spinner/texto "Registrando…" durante o envio.
- Formulários longos (recebimento, produção, expedição) usam `UnsavedChangesGuard`: confirmação ao sair pela navegação do app e aviso nativo ao fechar a aba.

### Robustez

- Erro ao renderizar uma página: `RouteErrorPage` dentro do layout ("Tentar novamente", ID da requisição se vier da API). Chunk ausente após um deploy (aba antiga) sugere recarregar.
- Erro fora das rotas: `AppErrorBoundary` (tela simples com "Recarregar").
- Offline: toast fixo "Você está sem conexão" até a rede voltar; falha de rede nas consultas gera um único toast (QueryCache).
- Números e datas sempre em pt-BR (`lib/quantity.ts`: `formatQuantity`, `formatDate`, `formatDateTime`).

### Acessibilidade

Foco visível em todos os controles (anel `ring`), `aria-label` em botões só de ícone, diálogos e menus do Radix (foco preso, Esc fecha, navegação por setas), contraste AA nos dois temas e animações reduzidas com `prefers-reduced-motion`.

### PWA básico

`public/site.webmanifest` com ícones PNG (192, 512 e maskable) e `apple-touch-icon`; `theme-color` acompanha o tema.

## Visual

Cinzas levemente aquecidos com acento marrom "café" (`--primary`) e barra lateral em tom espresso com destaque caramelo. Tokens em `src/index.css` (OKLCH), com tema claro e escuro (ver "Design system").
