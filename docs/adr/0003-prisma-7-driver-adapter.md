# 0003 — Prisma 7 com driver adapter (`@prisma/adapter-pg`)

- **Status:** Aceito (2026-10-15)

## Contexto

Versões antigas do Prisma usam um query engine binário em Rust: exige `binaryTargets` corretos para a Lambda e aumenta o pacote (pior cold start).

## Decisão

Usar Prisma 7 com o cliente sem engine Rust e o driver `pg` via `@prisma/adapter-pg`.

## Consequências

- Sem binário nativo: bundle menor e esbuild mais simples para a Lambda.
- Pool de conexões controlado pelo `pg` — importante para limitar conexões ao RDS (concorrência da Lambda).
- `SELECT ... FOR UPDATE` e `WITH RECURSIVE` continuam via `$queryRaw`, encapsulados no helper tenant-aware (ver ADR 0004).
