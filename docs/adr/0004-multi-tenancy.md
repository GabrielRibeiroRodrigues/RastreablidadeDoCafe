# 0004 — Multi-tenancy por coluna `company_id`

- **Status:** Aceito (2026-10-15)

## Contexto

Várias empresas compartilham o mesmo banco. Vazamento entre empresas é o pior bug possível do sistema.

## Decisão

1. Toda tabela de negócio tem `company_id` (FK para `companies`), com índices/únicos compostos começando por ele.
2. O `companyId` da requisição vem do usuário autenticado (busca pelo `sub` do token) e fica no contexto via `nestjs-cls` (AsyncLocalStorage).
3. Uma **extensão do Prisma Client** injeta `company_id` em `where` (leitura, update, delete) e em `data` (create), sobrescrevendo qualquer valor vindo do cliente.
4. `findUnique` por id vira busca com tenant; recurso de outra empresa responde **404**, não 403 (não revela existência).
5. A extensão **não cobre `$queryRaw`**: SQL bruto só via um helper que exige `companyId`, e uma regra de lint proíbe `$queryRaw` fora dele.
6. Testes de integração obrigatórios: listar, buscar, atualizar, excluir e criar (com `companyId` forjado) contra outra empresa.

## Alternativas consideradas

- **Banco/schema por empresa**: isolamento forte, mas migrations e custo multiplicados — exagero para o porte.
- **Postgres Row-Level Security**: ótima segunda camada; exige `set_config` dentro de cada transação com Prisma. **Adiado para a revisão de segurança (Semana 5)** como defesa em profundidade.

## Consequências

- Isolamento centralizado, sem depender de cada desenvolvedor lembrar o filtro.
- Pontos cegos (SQL bruto, relações aninhadas) explicitamente tratados e testados.
