# Front-end (`apps/web`)

SPA em React 19 + Vite + TypeScript strict: layout, autenticação, as telas de cadastro (Produtos, Fornecedores, Clientes e Locais) e as telas de estoque (Recebimento, Lotes, Estoque e Movimentações), que falam com a API por um cliente tipado gerado do OpenAPI.

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
├── app/            # App (providers), rotas, QueryClient, itens de navegação
├── auth/           # AuthProvider, useAuth, ProtectedRoute, estratégias mock/cognito
├── components/
│   ├── catalog/    # blocos genéricos das telas de cadastro (tabela, filtros, CatalogPage...)
│   ├── form/       # campos RHF, TagInput, EntityCombobox, schemas Zod, erros da API → campos
│   ├── layout/     # AppLayout, AppSidebar, AppHeader
│   └── ui/         # componentes gerados pelo shadcn/ui (não editar à mão sem motivo)
├── config/env.ts   # leitura e validação (Zod) das variáveis VITE_*
├── features/       # um cadastro por pasta: api.ts, <X>Form.tsx, resource.tsx e testes
│                   # (products, suppliers, customers, locations); inventory/ = telas de estoque
├── lib/            # api-client.ts (openapi-fetch), api.ts (ApiError), br.ts, quantity.ts, jwt.ts
├── pages/          # login, callback do Cognito, 404
└── test/           # setup do Vitest, mock da API (fetch), sessão de teste
```

O alias `@/` aponta para `src/` (Vite, TypeScript e `components.json` do shadcn).

Para adicionar um componente do shadcn: `pnpm dlx shadcn@latest add <nome>` dentro de `apps/web`.

## Rotas

| Rota             | Acesso  | Conteúdo                                   |
| ---------------- | ------- | ------------------------------------------ |
| `/login`         | público | seleção de usuário (mock) ou botão Cognito |
| `/auth/callback` | público | conclui o login do Cognito e redireciona   |
| `/`              | privado | redireciona para `/produtos`               |
| `/produtos`      | privado | cadastro de produtos                       |
| `/fornecedores`  | privado | cadastro de fornecedores                   |
| `/clientes`      | privado | cadastro de clientes                       |
| `/locais`        | privado | cadastro de locais de estoque              |
| `/recebimento`   | privado | novo recebimento (admin e operador)        |
| `/lotes`         | privado | lista de lotes                             |
| `/lotes/:id`     | privado | detalhe do lote, ações e histórico         |
| `/estoque`       | privado | posição de estoque (lote × local)          |
| `/movimentacoes` | privado | razão de movimentações                     |
| `*`              | público | 404                                        |

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

Se uma chamada autenticada recebe **401**, o `AuthProvider` encerra a sessão, mostra o toast "Sua sessão expirou" e o `ProtectedRoute` leva ao login guardando a página atual.

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

| `type`                             | Mensagem                                                     |
| ---------------------------------- | ------------------------------------------------------------ |
| `/problems/insufficient-stock`     | "Saldo insuficiente em ARM-01: disponível 40,000"            |
| `/problems/lot-not-movable`        | "Lote em quarentena/bloqueado não pode ser movimentado"      |
| `/problems/already-reversed`       | "Esta movimentação já foi estornada."                        |
| `/problems/invalid-reversal`       | estorno de estorno                                           |
| `/problems/idempotency-key-reused` | mesma chave com outro corpo                                  |
| `/problems/invalid-movement`       | motivo do ajuste, origem = destino, ajuste com os dois lados |
| `/problems/lot-consumed` e outros  | lote consumido, produto inativo, destino inativo             |

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

Contrato da API em [estoque.md](estoque.md) e [anexos.md](anexos.md). A barra lateral ganhou a seção **Estoque** (Lotes, Estoque, Movimentações); Produção, Expedição e Recall seguem em "Em breve".

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

## Visual

Cinzas levemente aquecidos com acento marrom "café" (`--primary`) e barra lateral em tom espresso com destaque caramelo. Tokens em `src/index.css` (OKLCH); há valores para `.dark`, mas ainda não existe alternância de tema.
