# 0014 — Aviso de recall na página pública do QR code

- **Status:** Aceito (2026-10-19). Altera parte da decisão de privacidade da página pública ([etiqueta-pagina-publica.md](../etiqueta-pagina-publica.md)).

## Contexto

A página pública mostrava só "Disponível / Indisponível" e escondia o motivo de propósito (quarentena, bloqueio, recall), para não expor detalhes internos. Mas um recall existe justamente para alcançar quem tem o produto na mão — e o consumidor que lê o QR code da embalagem de um lote recolhido não recebia nenhum aviso.

## Decisão

- A resposta pública ganha `recall: { since, severity } | null`.
- O aviso aparece **só** quando o lote foi bloqueado por um recall executado (`recall_lots.blocked_at` preenchido) **e continua bloqueado**. Se o administrador liberar o lote depois da investigação (status volta a Disponível), o aviso some.
- **Continua escondido**: motivo do recall, número, clientes, quantidades, e o motivo de qualquer bloqueio manual ou quarentena (nesses casos `recall` é `null` e o lote aparece apenas como indisponível).
- A página mostra "Produto recolhido — não consuma" com orientação para contatar a empresa.

## Consequências

- O recall passa a ter um canal direto com o consumidor final, sem depender de a empresa encontrar cada pessoa.
- O texto público é genérico e não expõe a causa; a empresa decide o que comunicar por outros canais.
