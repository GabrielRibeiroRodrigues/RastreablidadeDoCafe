# Front-end (`apps/web`)

SPA em React 19 + Vite + TypeScript strict. Nesta etapa existe apenas o **esqueleto**: layout, autenticação e páginas provisórias. As telas de cadastro chegam quando houver o cliente tipado gerado do OpenAPI da API.

## Stack

| Item          | Escolha                                                          |
| ------------- | ---------------------------------------------------------------- |
| Build/dev     | Vite 8 (`@vitejs/plugin-react`)                                  |
| Estilo        | Tailwind CSS v4 + shadcn/ui (estilo `radix-nova`, ícones Lucide) |
| Rotas         | React Router 7 (modo _data_: `createBrowserRouter`)              |
| Dados         | TanStack Query 5                                                 |
| Formulários   | React Hook Form + Zod (`@hookform/resolvers`)                    |
| Auth Cognito  | `oidc-client-ts` (Authorization Code + PKCE)                     |
| Testes        | Vitest + Testing Library + jsdom                                 |
| Compartilhado | `@traceflow/shared` (tipo `Role`, lista `ROLES`)                 |

## Estrutura

```text
apps/web/src
├── app/            # App (providers), rotas, QueryClient, itens de navegação
├── auth/           # AuthProvider, useAuth, ProtectedRoute, estratégias mock/cognito
├── components/
│   ├── layout/     # AppLayout, AppSidebar, AppHeader
│   └── ui/         # componentes gerados pelo shadcn/ui (não editar à mão sem motivo)
├── config/env.ts   # leitura e validação (Zod) das variáveis VITE_*
├── lib/            # api.ts (fetch + ApiError), jwt.ts (decodificação no cliente)
├── pages/          # login, callback do Cognito, páginas provisórias, 404
└── test/           # setup do Vitest e utilitários de teste
```

O alias `@/` aponta para `src/` (Vite, TypeScript e `components.json` do shadcn).

Para adicionar um componente do shadcn: `pnpm dlx shadcn@latest add <nome>` dentro de `apps/web`.

## Rotas

| Rota             | Acesso  | Conteúdo                                   |
| ---------------- | ------- | ------------------------------------------ |
| `/login`         | público | seleção de usuário (mock) ou botão Cognito |
| `/auth/callback` | público | conclui o login do Cognito e redireciona   |
| `/`              | privado | redireciona para `/produtos`               |
| `/produtos`      | privado | provisório ("Em breve")                    |
| `/fornecedores`  | privado | provisório                                 |
| `/clientes`      | privado | provisório                                 |
| `/locais`        | privado | provisório                                 |
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

## Chamadas à API

`src/lib/api.ts` é um wrapper mínimo de `fetch` (será substituído/embrulhado pelo `openapi-fetch`):

- injeta `Authorization: Bearer <token>` quando recebe `accessToken`;
- envia `x-request-id` (`crypto.randomUUID()`) para correlação com os logs da API;
- converte erros RFC 9457 (`application/problem+json`) em `ApiError` tipado (`status`, `type`, `title`, `detail`, `errors`, `requestId`);
- falhas de rede viram `ApiError` com `status: 0` e mensagem em português.

O QueryClient não repete consultas que falharam com 4xx. No logout o cache do TanStack Query é limpo, para não exibir dados de uma empresa a outro usuário.

## Contrato assumido com a API

Endpoints de desenvolvimento (somente com `AUTH_MODE=mock` na API):

```http
GET /v1/dev/users
→ 200 [{ "email": string, "name": string, "roles": ("admin"|"operator"|"auditor")[], "companyName": string }]

POST /v1/dev/token
{ "email": string }
→ 200 { "accessToken": string, "expiresIn": number }
```

Erros em `application/problem+json`:

```json
{
  "type": "https://...",
  "title": "Dados inválidos",
  "status": 422,
  "detail": "Um ou mais campos são inválidos.",
  "errors": [{ "field": "sku", "message": "SKU já cadastrado" }]
}
```

> O formato de `errors` (`field` + `message`) é uma suposição do front; ajustar quando a API definir o seu.

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
