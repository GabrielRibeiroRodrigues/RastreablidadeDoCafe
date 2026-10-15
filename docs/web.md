# Front-end (`apps/web`)

SPA em React 19 + Vite + TypeScript strict: layout, autenticação e as telas de cadastro (Produtos, Fornecedores, Clientes e Locais), que falam com a API por um cliente tipado gerado do OpenAPI.

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
│   ├── form/       # campos RHF, TagInput, schemas Zod comuns, erros da API → campos
│   ├── layout/     # AppLayout, AppSidebar, AppHeader
│   └── ui/         # componentes gerados pelo shadcn/ui (não editar à mão sem motivo)
├── config/env.ts   # leitura e validação (Zod) das variáveis VITE_*
├── features/       # um cadastro por pasta: api.ts, <X>Form.tsx, resource.tsx e testes
│                   # (products, suppliers, customers, locations)
├── lib/            # api-client.ts (openapi-fetch), api.ts (ApiError), br.ts, jwt.ts
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
