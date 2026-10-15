# Cadastros (API)

Produtos, fornecedores, clientes e locais seguem **o mesmo contrato**. Código: `apps/api/src/modules/<recurso>/`. Swagger: `/docs`.

## Rotas (para cada recurso)

| Método e rota                       | Perfis          | Descrição                                                |
| ----------------------------------- | --------------- | -------------------------------------------------------- |
| `GET /v1/<recurso>`                 | todos           | Lista paginada com filtros                               |
| `GET /v1/<recurso>/:id`             | todos           | Detalhe (404 se não existir **ou for de outra empresa**) |
| `POST /v1/<recurso>`                | admin, operador | Cria (201)                                               |
| `PATCH /v1/<recurso>/:id`           | admin, operador | Edita parcialmente                                       |
| `POST /v1/<recurso>/:id/deactivate` | admin           | Desativa (não existe exclusão)                           |
| `POST /v1/<recurso>/:id/activate`   | admin           | Reativa                                                  |

Recursos: `products`, `suppliers`, `customers`, `locations`.

## Listagem

`?page=1&pageSize=20&status=active|inactive|all&q=...&sort=...` → `{ data, meta: { page, pageSize, total, totalPages } }`

- `pageSize` máximo 100; `status` padrão `active`.
- `sort`: campo, ou `-campo` para decrescente; desempate estável por `id`.

| Recurso     | Busca `q`                | Filtros         | `sort` (padrão primeiro)   |
| ----------- | ------------------------ | --------------- | -------------------------- |
| `products`  | nome, SKU                | `type`          | `name`, `sku`, `createdAt` |
| `suppliers` | nome, fazenda, documento | `type`, `state` | `name`, `createdAt`        |
| `customers` | nome, e-mail, documento  | `state`         | `name`, `createdAt`        |
| `locations` | código, nome             | `type`          | `code`, `name`             |

## Regras de validação

- Campos desconhecidos no corpo → **400** (inclusive `companyId`: a empresa nunca vem do cliente).
- Textos são aparados; opcional enviado como `""` vira `null` (limpa o campo).
- **SKU** e **código do local**: letras, dígitos e hífen, convertidos para maiúsculas; únicos na empresa → **409** com `errors: [{ field: 'sku' }]`.
- **CPF/CNPJ**: aceitos com ou sem pontuação, validados pelos dígitos verificadores e armazenados só com dígitos; únicos na empresa.
- **UF**: uma das 27 siglas. **Altitude**: 0–3000 m. **Variedades**: até 20, sem repetidos.
- **Grau de torra padrão**: só para produtos `ROASTED` e `BLEND` (também validado na edição).
- O `companyId` nunca aparece nas respostas.

## Testes

Cada recurso usa `describeCatalogResource()` (`apps/api/test/support/catalog-suite.ts`), que garante para todos: isolamento entre empresas (listar, ler, editar, desativar, `companyId` forjado), matriz de perfis, ciclo ativar/desativar, paginação e validação de id — e acrescenta os testes específicos do recurso.
