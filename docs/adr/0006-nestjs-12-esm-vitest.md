# 0006 — NestJS 12 em ESM com Vitest

- **Status:** Aceito (2026-10-15) — substitui a escolha de Jest do plano inicial

## Contexto

Em outubro de 2026 o NestJS 12 é a versão estável (`latest`); a 11 está marcada como `legacy`. Os pacotes do Nest 12 são ESM, e o `nest new` oficial gera projetos ESM com **Vitest** (Jest permanece só no modo CommonJS).

## Decisão

- API em **NestJS 12, ESM** (`"type": "module"`, `module: NodeNext`, imports relativos com `.js`).
- Testes com **Vitest** (unitários `*.spec.ts` e e2e `test/*.e2e-spec.ts`) + supertest; Testcontainers na etapa 4.
- Metadata de decorators (necessária para a injeção de dependência do Nest) gerada pelo transformador **oxc** do Vite (`decorator.emitDecoratorMetadata`), sem SWC.

## Por que não SWC

O plugin usual (`unplugin-swc`) depende do addon nativo do SWC, que nesta máquina recusou o diretório de cache por causa das permissões NTFS do perfil de usuário. O oxc já vem com o Vite 8, não tem addon nativo à parte e resolveu o problema com menos dependências.

## Consequências

- Mesmo runner de testes na API e no front.
- Bundle ESM para a Lambda com esbuild (Semana 6) sem camada de compatibilidade.
- `main.ts` usa top-level `await`.
