# 0002 — Node 24 LTS e TypeScript 6.0

- **Status:** Aceito (2026-10-15)

## Contexto

O plano original citava Node 20, que saiu de suporte em abril de 2026. Em outubro de 2026 o `latest` do TypeScript é a versão 7 (compilador nativo em Go), mas typescript-eslint, NestJS CLI e outras ferramentas ainda dependem da API em JavaScript do compilador (suportam até `<6.1`).

## Decisão

- Node **24 LTS** local, na CI e na Lambda (runtime `nodejs24.x`).
- TypeScript fixado em **`~6.0`**.

## Consequências

- Mesma versão de runtime em todo lugar.
- Reavaliar a migração para TS 7 quando o typescript-eslint suportar.
