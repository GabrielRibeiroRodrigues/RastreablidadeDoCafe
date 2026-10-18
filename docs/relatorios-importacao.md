# Dashboard, relatórios CSV e importação

Código: `apps/api/src/modules/{dashboard,reports,imports}/` e `apps/api/src/common/csv/csv.ts`.

## Dashboard — `GET /v1/dashboard`

Todos os perfis. Quatro consultas em paralelo (contadores num único `SELECT`, vencimentos, estoque por produto e últimas movimentações), todas escopadas à empresa via `TenantPrismaService`.

```jsonc
{
  "lots": { "available": 14, "quarantine": 1, "blocked": 0, "consumed": 0 },
  "expiringSoon": {
    "days": 30,
    "count": 1,
    "items": [
      {
        "id": "…",
        "code": "CAF-2026-000002",
        "product": { "id": "…", "sku": "VRD-BOURBON-AM", "name": "Café verde Bourbon Amarelo" },
        "expiresAt": "2026-11-01",
        "balance": "17.000",
        "unit": "BAG_60KG",
      },
    ],
  },
  "movementsToday": 36,
  "stockByProduct": [
    {
      "productId": "…",
      "sku": "TOR-ESPECIAL",
      "name": "…",
      "type": "ROASTED",
      "unit": "KG",
      "quantity": "882.000",
    },
  ],
  "production30d": { "orders": 9, "avgYieldPercent": 85.09, "lossKg": "346.000" },
  "shipments30d": { "count": 2, "customers": 2 },
  "recentMovements": [/* MovementResponse, igual a GET /v1/movements */],
}
```

| Campo                           | Regra                                                                                                                   |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `lots`                          | Quantidade de lotes por situação                                                                                        |
| `expiringSoon`                  | Lotes **com saldo** com validade até hoje + 30 dias (inclui já vencidos); `items` traz até 5, os mais próximos primeiro |
| `movementsToday`                | Movimentações com `occurredAt` a partir da meia-noite de hoje em `America/Sao_Paulo`                                    |
| `stockByProduct`                | Até 8 produtos com maior saldo (soma de lotes e locais), na unidade do produto — sacas e kg não são convertidos         |
| `production30d.avgYieldPercent` | Rendimento **ponderado pela massa**: Σ saída kg ÷ Σ entrada kg × 100 (só ordens com saída em kg); `null` sem ordens     |
| `production30d.lossKg`          | Soma das perdas (kg) das ordens dos últimos 30 dias                                                                     |
| `shipments30d`                  | Expedições dos últimos 30 dias e clientes distintos atendidos                                                           |
| `recentMovements`               | Até 8 últimas movimentações (mesmo formato de `/v1/movements`)                                                          |

Quantidades são strings com 3 casas, como no resto da API. O fuso `America/Sao_Paulo` é fixo enquanto a empresa não tiver fuso próprio.

## Desempenho por período — `GET /v1/dashboard/performance?days=30|90|180|365`

Seção **Desempenho** do painel, com seletor de período (guardado na URL, `?periodo=90`):

- **Comparação**: ordens de produção, rendimento médio ponderado pela massa (Σ saída ÷ Σ entrada), perda e expedições, contra os `days` dias anteriores. A variação aparece com seta e sinal (pontos percentuais para o rendimento), sem cor de "bom/ruim".
- **Série de rendimento**: por semana até 90 dias e por mês acima disso, no fuso de São Paulo. O gráfico de barras começa no zero, a massa produzida fica no tooltip (não há segundo eixo) e há uma tabela equivalente para leitores de tela.
- **Giro de estoque**: até 8 produtos com maior saída no período (expedições `ISSUE` e consumo na produção `CONSUMPTION`, descontados os estornos dessas saídas), saldo atual e **dias de cobertura** (saldo ÷ saída diária média).

## Relatórios CSV — `GET /v1/reports/*.csv`

Todos os perfis. Formato pensado para o **Excel em português** abrir com duplo clique:

- `Content-Type: text/csv; charset=utf-8`, arquivo começa com BOM (UTF-8);
- separador `;`, decimal com vírgula (`1250,500`), linhas CRLF;
- datas `dd/mm/aaaa hh:mm` no fuso de São Paulo; validade `dd/mm/aaaa`;
- cabeçalhos e rótulos (tipo, situação, unidade) em português; CPF/CNPJ com pontuação (o Excel não o converte em número);
- `Content-Disposition: attachment; filename="estoque-2026-10-15.csv"`;
- **proteção contra fórmulas**: texto que começa com `=`, `+`, `-`, `@`, TAB ou CR recebe um `'` na frente.

Máximo de **20.000 linhas** por arquivo (abaixo do limite de 6 MB de resposta da Lambda). Os headers `X-Report-Rows` e `X-Report-Truncated: true|false` informam se o arquivo foi cortado — nesse caso, filtre por período.

| Rota             | Filtros                                                                                       | Conteúdo                                                                                                                                               |
| ---------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `stock.csv`      | Os mesmos de `/v1/stock` (`productId`, `locationId`, `lotStatus`, `productType`, `q`, `sort`) | Saldo por lote e local                                                                                                                                 |
| `movements.csv`  | `from`, `to`, `type`, `lotId`                                                                 | Razão em ordem cronológica: data, tipo, lote, produto, origem, destino, quantidade, documento, motivo, se é estorno, usuário                           |
| `production.csv` | `from`, `to`, `stage`                                                                         | Número, etapa, data, lote gerado, produto, quantidade, insumos (`CAF-…(5,000 saca 60 kg) \| …`), entrada kg, saída kg, rendimento %, perda kg, usuário |
| `shipments.csv`  | `from`, `to`, `customerId`                                                                    | Uma linha por item: expedição, data, cliente, CPF/CNPJ, cidade/UF, pedido/NF, lote, produto, local, quantidade, usuário                                |

`from` é inclusivo e `to` exclusivo (ISO 8601, ex.: `2026-10-01`).

## Importação de cadastros — `POST /v1/imports/{entity}?dryRun=true|false`

Só **admin**. `entity`: `products`, `suppliers`, `customers` ou `locations`.

- Corpo `text/csv` (o arquivo cru) **ou** `multipart/form-data` com o campo `file`.
- Máximo de **2 MB** (413) e **5.000 linhas** de dados (413, `IMPORT_TOO_LARGE`).
- Codificação UTF-8 (com ou sem BOM) ou Windows-1252 (o "CSV" padrão do Excel) — detectada automaticamente.
- Separador `;` ou `,`, detectado pela primeira linha. Aspas seguem o RFC 4180.
- Primeira linha = cabeçalho com os nomes das colunas abaixo (em inglês, iguais aos campos da API), em qualquer ordem. Coluna desconhecida ou obrigatória ausente é erro na linha 1.
- Célula vazia = campo não informado. Valores de enum aceitam minúsculas.
- Cada linha é validada com **o mesmo DTO** do `POST` do cadastro (class-validator) e pela unicidade no arquivo (repetição a partir da 2ª ocorrência) e no banco (inclusive cadastros inativos).
- `dryRun=true` (padrão): só valida. `dryRun=false`: se **não houver nenhum erro**, grava tudo numa única transação (tudo ou nada); com erros, nada é gravado.

Resposta (sempre 200 quando o arquivo pôde ser lido):

```json
{
  "entity": "products",
  "dryRun": true,
  "total": 5,
  "valid": 2,
  "invalid": 3,
  "created": 0,
  "errors": [
    {
      "line": 4,
      "field": "unit",
      "messages": ["unit must be one of the following values: KG, BAG_60KG, UNIT"]
    },
    { "line": 5, "field": "sku", "messages": ["sku repeats line 2"] },
    { "line": 6, "field": "sku", "messages": ["sku already exists"] }
  ]
}
```

`line` é a linha física do arquivo (1 = cabeçalho). `field: "row"` indica uma linha com mais células que o cabeçalho.

### Modelos de arquivo

Negrito = obrigatória.

| Cadastro    | Colunas                                                                                              | Chave única | Observações                                                                                                |
| ----------- | ---------------------------------------------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------- |
| `products`  | **sku**, **name**, **type**, **unit**, defaultRoastLevel, description                                | `sku`       | `type`: GREEN, ROASTED, BLEND, PACKAGING; `unit`: KG, BAG_60KG, UNIT; grau de torra só para ROASTED/BLEND  |
| `suppliers` | **name**, **type**, document, farmName, region, city, state, altitudeMeters, varieties, email, phone | `document`  | `type`: PRODUCER, FARM, COOPERATIVE, TRADER; `varieties` separadas por `\|`; CPF/CNPJ com ou sem pontuação |
| `customers` | **name**, document, email, phone, city, state                                                        | `document`  | `state` = UF                                                                                               |
| `locations` | **code**, **name**, **type**, description                                                            | `code`      | `type`: WAREHOUSE, SILO, ROASTERY, QUARANTINE, SHIPPING                                                    |

Exemplo (`products.csv`):

```csv
sku;name;type;unit;defaultRoastLevel;description
VRD-CATUAI;Café verde Catuaí Vermelho;GREEN;BAG_60KG;;Safra 2025/26
TOR-SUAVE;Torrado suave;ROASTED;KG;MEDIUM_LIGHT;"Notas de caramelo; corpo médio"
```

Exemplo (`suppliers.csv`):

```csv
name;type;document;farmName;region;city;state;altitudeMeters;varieties
José da Silva;PRODUCER;111.222.333-96;Sítio Boa Vista;Sul de Minas;Carmo de Minas;MG;1150;Bourbon Amarelo|Catuaí Vermelho
```

## Códigos de erro

Ver [seguranca.md](seguranca.md#códigos-de-erro-estáveis) — toda resposta de erro traz `code`.
