# Domínio

## Glossário PT ↔ EN

O código usa inglês; a interface e os documentos, português.

| Português (UI/docs)                | Inglês (código)            | Tabela              |
| ---------------------------------- | -------------------------- | ------------------- |
| Empresa                            | Company                    | `companies`         |
| Usuário                            | User                       | `users`             |
| Produto                            | Product                    | `products`          |
| Fornecedor / Fazenda               | Supplier                   | `suppliers`         |
| Cliente                            | Customer                   | `customers`         |
| Local                              | Location                   | `locations`         |
| Lote                               | Lot                        | `lots`              |
| Movimentação                       | StockMovement              | `stock_movements`   |
| Ordem de produção                  | ProductionOrder            | `production_orders` |
| Origem do lote                     | LotOrigin                  | `lot_origins`       |
| Expedição                          | Shipment                   | `shipments`         |
| Recall                             | Recall                     | `recalls`           |
| Não conformidade                   | NonConformity              | `non_conformities`  |
| Quarentena                         | Quarantine (status)        | —                   |
| Estorno                            | Reversal                   | —                   |
| Safra                              | Harvest (crop year)        | —                   |
| Peneira                            | Screen size                | —                   |
| Grau de torra                      | Roast level                | —                   |
| Pontuação (SCA)                    | Cupping score              | —                   |
| Administrador / Operador / Auditor | admin / operator / auditor | —                   |

## Perfis

| Ação                    | admin | operator | auditor |
| ----------------------- | :---: | :------: | :-----: |
| Ler cadastros           |  ✅   |    ✅    |   ✅    |
| Criar/editar cadastros  |  ✅   |    ✅    |   ❌    |
| Desativar cadastros     |  ✅   |    ❌    |   ❌    |
| Editar dados da empresa |  ✅   |    ❌    |   ❌    |

## Cadastros (Semana 1)

- **Company**: empresa (tenant). Na Semana 1 é criada apenas pelo seed.
- **User**: pertence a **uma** empresa; ligado ao Cognito pelo `sub`. Perfis vêm dos grupos do Cognito.
- **Product**: tipo (`GREEN` café verde, `ROASTED` torrado, `BLEND`, `PACKAGING` embalagem), SKU único por empresa, unidade (kg, sc, un), grau de torra padrão para torrados.
- **Supplier**: produtor ou fazenda — documento (CPF/CNPJ), região, município/UF, altitude, variedades cultivadas.
- **Customer**: cliente que recebe expedições.
- **Location**: armazém, silo, área de quarentena etc.

Todos têm `company_id`, `isActive` (desativação em vez de exclusão — lotes vão referenciá-los) e timestamps.

## Regras que valem para todo o sistema

1. **Isolamento por empresa**: nenhuma consulta enxerga dados de outra empresa; tentativa de acesso retorna 404.
2. **Movimentação imutável** (Semana 2): correção só por estorno.
3. **Saldo nunca negativo** (Semana 2): calculado das movimentações, com bloqueio pessimista.
4. Os campos de qualidade do café (safra, umidade, peneira, pontuação, torra real) pertencem ao **lote**, pois variam a cada recebimento (Semana 2).
