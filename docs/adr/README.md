# Decisões de arquitetura (ADRs)

Formato curto: contexto, decisão, consequências. Uma decisão nunca é apagada — se mudar, um novo ADR a substitui.

| #    | Decisão                                                                                                    | Status |
| ---- | ---------------------------------------------------------------------------------------------------------- | ------ |
| 0001 | [Monorepo com pnpm workspaces](0001-monorepo-pnpm.md)                                                      | Aceito |
| 0002 | [Node 24 LTS e TypeScript 6.0](0002-node-24-typescript-6.md)                                               | Aceito |
| 0003 | [Prisma 7 com driver adapter](0003-prisma-7-driver-adapter.md)                                             | Aceito |
| 0004 | [Multi-tenancy por coluna company_id](0004-multi-tenancy.md)                                               | Aceito |
| 0005 | [Autenticação Cognito e emissor simulado](0005-auth-cognito-mock-issuer.md)                                | Aceito |
| 0007 | [Razão de estoque imutável com trava por lote](0007-razao-de-estoque.md)                                   | Aceito |
| 0008 | [Genealogia em arestas e rastreio com WITH RECURSIVE](0008-genealogia-e-rastreio-recursivo.md)             | Aceito |
| 0006 | [NestJS 12 em ESM com Vitest](0006-nestjs-12-esm-vitest.md)                                                | Aceito |
| 0009 | [Recall orquestrado em etapas idempotentes](0009-recall-orquestrado.md)                                    | Aceito |
| 0010 | [Rede na AWS: Lambdas fora da VPC e RDS público com TLS](0010-rede-e-custos-aws.md)                        | Aceito |
| 0011 | [API na Lambda: esbuild sobre o tsc e job de migrations](0011-lambda-esbuild-migrations.md)                | Aceito |
| 0012 | [Perfil do banco como fonte de verdade e gestão de usuários](0012-perfil-do-banco-e-gestao-de-usuarios.md) | Aceito |
| 0013 | [Cancelamento de ordens e expedições; estornos fora do recall](0013-cancelamento-de-operacoes.md)          | Aceito |
| 0014 | [Aviso de recall na página pública do QR code](0014-aviso-de-recall-na-pagina-publica.md)                  | Aceito |
| 0015 | [Inventário: contagem física aplicada como ajustes no razão](0015-inventario-contagem-fisica.md)           | Aceito |
