# 0011 — API na Lambda: bundle esbuild do JS do tsc e migrations por um job próprio

- **Status:** Aceito (2026-10-15)

## Contexto

A API é NestJS 12 em ESM com Prisma 7 + `@prisma/adapter-pg` (ADR 0003, 0006). Para rodar na Lambda (Node 24, arm64) precisamos de:

1. Um handler que traduza eventos do API Gateway HTTP API para o Express do Nest, reaproveitando a mesma configuração HTTP do `main.ts` (`configureApp`).
2. Um pacote pequeno e autocontido. O esbuild é o bundler natural, mas **não emite `emitDecoratorMetadata`** — e a injeção de dependência do Nest depende dos metadados `design:paramtypes`.
3. Um jeito de aplicar migrations no RDS a cada deploy. O `prisma migrate deploy` depende do CLI do Prisma e do _schema engine_ (binário), pesados e frágeis numa Lambda arm64.

## Decisão

### Handler

`apps/api/src/lambda.ts` usa `@codegenie/serverless-express` 5 (sucessor do `@vendia/serverless-express`). O app Nest é criado **uma vez por ambiente de execução** (promise em cache; se o boot falhar, a próxima invocação tenta de novo) e `callbackWaitsForEmptyEventLoop = false` evita que o pool do `pg` segure a resposta.

### Segredos

`apps/api/src/lambda/runtime-secrets.ts`: toda variável `FOO_SSM_PARAMETER=/caminho` vira `FOO` com o valor descriptografado do SSM, no init. O bundle envolve **todos** os handlers (API e jobs) num wrapper com _top-level await_ que resolve os segredos **antes** de avaliar o módulo do handler — então até jobs escritos sem saber disso (que leem `process.env.DATABASE_URL` na importação) funcionam.

### Bundle

`apps/api/scripts/bundle-lambda.mjs`:

- Entrada: a saída do `tsc` (`nest build` → `dist/`), não o TypeScript. O `tsc` já emitiu os metadados de decorators; o esbuild só junta e minifica. Alternativas descartadas: `esbuild-plugin-tsc` (roda o `tsc` arquivo a arquivo, lento) e SWC (problemas de cache nativo no Windows, ADR 0006).
- Saída ESM `.mjs`, `target: node24`, `minify` com `keepNames` (o Nest usa nomes de classe em tokens e logs), sourcemap externo (`NODE_OPTIONS=--enable-source-maps`).
- Tudo é empacotado, inclusive o AWS SDK v3 (não dependemos da versão do runtime). Ficam externos só os pacotes opcionais que o Nest/Swagger carregam com `require` dentro de `try/catch` e que não estão instalados (`@nestjs/microservices`, `@nestjs/websockets`, `@fastify/static`...).
- Banner com `createRequire` e `__dirname` para as dependências CommonJS.
- O cliente Prisma 7 traz o _query compiler_ como WASM em base64 dentro de um `.mjs`: entra no bundle sem arquivo nativo.
- Entradas: `api`, `migrate`, `expiry-alert`, `recall-step`. Entrada cujo fonte ainda não existe é pulada com aviso (os jobs da Semana 4 chegam por outro branch); o workflow de deploy desliga os recursos Terraform correspondentes.
- Cada entrada vira `dist-lambda/<nome>/index.mjs` e `dist-lambda/<nome>.zip` (zip determinístico, datas fixas).

### Migrations

`apps/api/src/jobs/migrate.job.ts` + `migration-runner.ts`: um executor mínimo **compatível com o Prisma Migrate**:

- mesma tabela `_prisma_migrations`, mesmas colunas, checksum SHA-256 do `migration.sql` e o mesmo _advisory lock_ (`72707369`) do Prisma — conferido localmente: depois do runner, `prisma migrate status` responde "Database schema is up to date";
- migration já aplicada com checksum diferente gera aviso; migration com falha registrada bloqueia (como o erro P3009 do Prisma) até `prisma migrate resolve`;
- cada migration roda **numa transação** (DDL é transacional no Postgres): falha não deixa schema pela metade. Migrations que não podem rodar em transação (`CREATE INDEX CONCURRENTLY`) devem ser aplicadas com o CLI;
- a pasta `prisma/migrations` é copiada para dentro do pacote da Lambda.

O workflow de deploy invoca essa Lambda depois do `terraform apply` e antes de publicar o front.

## Consequências

- O deploy da API depende de `nest build` + `bundle-lambda` (`pnpm --filter @traceflow/api bundle:lambda`), sem Docker.
- Tamanhos (2026-10-15): `api` 9,2 MB (`index.mjs`; ~4,6 MB do WASM do Prisma), zip de 4,5 MB; `migrate` 0,6 MB, zip de 0,4 MB.
- Boot local do bundle (`pnpm --filter @traceflow/api smoke:lambda`, evento falso do API Gateway v2): ~1,4 s para carregar o módulo e ~0,25 s para a primeira requisição (inclui `app.init()`); requisições seguintes em 3–5 ms. Na Lambda (arm64, 1024 MB) o cold start deve ficar na faixa de 1,5–3 s.
- O runner de migrations é código nosso para manter; o ganho é não carregar o CLI do Prisma para a nuvem. Se o Prisma passar a oferecer `migrate deploy` programático sem binário, vale trocar.
- Conhecido: o `pino-http` registra `request aborted` no fim de algumas requisições na Lambda (o objeto de resposta do serverless-express não sinaliza `writableEnded`); é só a mensagem de log, o status registrado está correto.
