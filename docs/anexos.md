# Anexos de lotes

Laudos de classificação, notas fiscais e fotos ficam num **bucket S3 privado** (MinIO no ambiente local). O arquivo vai **direto do navegador para o bucket** por um formulário pré-assinado: a API nunca recebe os bytes (na Lambda, o limite de payload é 6 MB) e o navegador nunca recebe credenciais.

## Rotas

Todas sob `/v1/lots/:lotId/attachments`. Lote ou anexo de outra empresa responde **404**.

| Método | Rota            | Perfis          | O que faz                                                          |
| ------ | --------------- | --------------- | ------------------------------------------------------------------ |
| POST   | `/`             | admin, operator | Registra o anexo (`PENDING`) e devolve o formulário de upload      |
| POST   | `/:id/confirm`  | admin, operator | Confere o objeto no bucket (HEAD) e marca `UPLOADED` (idempotente) |
| GET    | `/`             | todos           | Lista os anexos `UPLOADED` do lote (mais recentes primeiro)        |
| GET    | `/:id/download` | todos           | Devolve `{ url, expiresAt }`: URL GET pré-assinada                 |

Corpo do `POST /`: `{ fileName, contentType, sizeBytes }`.

- Tipos aceitos: `application/pdf`, `image/jpeg`, `image/png`, `image/webp`.
- `sizeBytes` ≤ `ATTACHMENT_MAX_BYTES` (padrão 10 MB); `fileName` até 200 caracteres, sem `/`, `\` ou caracteres de controle.
- Resposta: `{ attachment, upload: { url, fields, expiresAt } }`.

As respostas **nunca** trazem `companyId` nem `storageKey`. Erros seguem o padrão problem+json da API (400 validação, 404, 409 no confirm, 503 sem armazenamento).

## Fluxo

```mermaid
sequenceDiagram
    participant W as Navegador
    participant A as API
    participant DB as Postgres
    participant S as S3 / MinIO

    W->>A: POST /lots/:lotId/attachments {fileName, contentType, sizeBytes}
    A->>DB: lote existe na empresa? (senão 404)
    A->>DB: INSERT attachment (PENDING, chave {companyId}/lots/{lotId}/{uuid})
    A-->>W: { attachment, upload: { url, fields, expiresAt } }
    W->>S: POST multipart (fields + file)
    S-->>W: 204 (ou 400/403 se violar a política)
    W->>A: POST /lots/:lotId/attachments/:id/confirm
    A->>S: HEAD objeto
    alt objeto ausente ou diferente do declarado
        A-->>W: 409
    else ok
        A->>DB: UPDATE status = UPLOADED, uploaded_at = now()
        A-->>W: attachment (UPLOADED)
    end
    W->>A: GET /lots/:lotId/attachments/:id/download
    A-->>W: { url, expiresAt } (GET pré-assinado, attachment; filename=...)
    W->>S: GET url
```

### Enviando o arquivo

Os `fields` devem ir **antes** do campo `file`, num `multipart/form-data`:

```ts
const form = new FormData();
for (const [k, v] of Object.entries(upload.fields)) form.append(k, v);
form.append('file', file); // por último
await fetch(upload.url, { method: 'POST', body: form });
```

## Segurança

- **Bucket privado**: sem acesso anônimo (GET direto no objeto responde 403). Leitura só por URL pré-assinada de curta duração (`ATTACHMENT_URL_TTL_SECONDS`, padrão 300 s).
- **Política do POST pré-assinado**: o próprio S3 aplica as condições, não o navegador:
  - `key` exata (o navegador não escolhe onde gravar);
  - `content-length-range` de 1 até o **tamanho declarado** (arquivo maior → `EntityTooLarge`);
  - `Content-Type` **igual** ao declarado;
  - expira junto com o TTL.
- **Chave por empresa**: `{companyId}/lots/{lotId}/{uuid}`. O UUID evita colisão e não expõe o nome original; o prefixo da empresa permite políticas/limpezas por tenant. A chave é gerada pela API, nunca vem do cliente.
- **Por que confirmar com HEAD**: a API não participa do upload, então não sabe se ele aconteceu. O `confirm` verifica no bucket que o objeto existe com o tamanho e o tipo declarados antes de marcá-lo `UPLOADED`; só esses aparecem na listagem e no download. Anexos `PENDING` abandonados não aparecem em lugar nenhum (uma limpeza periódica pode removê-los depois).
- **Download**: `ResponseContentDisposition: attachment` com o nome original (`filename` ASCII + `filename*` UTF-8), para o navegador baixar em vez de renderizar conteúdo enviado por usuário.
- **Isolamento**: a consulta do lote e do anexo passa pelo `TenantPrismaService`; de outra empresa → 404 antes de qualquer assinatura.

## Configuração

| Variável                     | Padrão      | Observação                                                                                                              |
| ---------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------- |
| `S3_BUCKET`                  | —           | Sem ela a API sobe e a lista de anexos funciona; upload, download e etiqueta respondem **503** "Storage not configured" |
| `S3_REGION`                  | `us-east-1` |                                                                                                                         |
| `S3_ENDPOINT`                | —           | Endpoint usado pela API (MinIO). Na AWS, vazio                                                                          |
| `S3_PUBLIC_ENDPOINT`         | —           | Endpoint usado para assinar URLs do navegador, se diferente do anterior                                                 |
| `S3_FORCE_PATH_STYLE`        | `false`     | `true` no MinIO                                                                                                         |
| `S3_ACCESS_KEY_ID`           | —           | Só local. Usadas apenas se as duas estiverem definidas                                                                  |
| `S3_SECRET_ACCESS_KEY`       | —           | Na AWS, a role da Lambda fornece as credenciais                                                                         |
| `ATTACHMENT_MAX_BYTES`       | 10485760    | Tamanho máximo aceito na solicitação                                                                                    |
| `ATTACHMENT_URL_TTL_SECONDS` | 300         | Validade do formulário de upload e da URL de download (30–3600)                                                         |

## Uso local (MinIO)

```bash
pnpm storage:up      # sobe o MinIO e cria o bucket privado traceflow-attachments
```

| URL                   | O quê                                              |
| --------------------- | -------------------------------------------------- |
| http://localhost:9000 | API S3                                             |
| http://localhost:9001 | Console (usuário `traceflow` / `traceflow-secret`) |

O `apps/api/.env.example` já vem com os valores do MinIO (`S3_ENDPOINT=http://localhost:9000`, `S3_FORCE_PATH_STYLE=true`).

- A MinIO deixou de publicar imagens Docker oficiais; o compose usa as builds da comunidade `pgsty/minio` e `pgsty/mc`, com tags fixas.
- `minio-init` roda uma vez (`mc mb --ignore-existing` + `mc anonymous set none`) e termina; pode ser reexecutado sem efeito colateral.
- **API em contêiner** (`pnpm stack:up`): a API fala com `http://minio:9000`, mas o navegador só alcança `localhost:9000`. Por isso o compose define `S3_PUBLIC_ENDPOINT=http://localhost:9000`: as URLs/formulários são assinados para o host que o navegador vai usar (a assinatura inclui o host, então não dá para trocar depois).

### Teste manual com curl

```bash
TOKEN=$(curl -s -X POST localhost:3000/v1/dev/token -H 'content-type: application/json' \
  -d '{"email":"ana@serraazul.dev"}' | jq -r .accessToken)
LOT=<id de um lote da empresa>

curl -s -X POST localhost:3000/v1/lots/$LOT/attachments -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"fileName":"laudo.pdf","contentType":"application/pdf","sizeBytes":125}' > upload.json

# um -F por item de upload.fields, e o arquivo por último:
curl -F "Content-Type=application/pdf" -F "key=..." -F "Policy=..." ... \
  -F "file=@laudo.pdf;type=application/pdf" http://localhost:9000/traceflow-attachments

curl -s -X POST localhost:3000/v1/lots/$LOT/attachments/<id>/confirm -H "authorization: Bearer $TOKEN"
curl -s localhost:3000/v1/lots/$LOT/attachments -H "authorization: Bearer $TOKEN"
curl -s localhost:3000/v1/lots/$LOT/attachments/<id>/download -H "authorization: Bearer $TOKEN"
```

## AWS (planejado)

- **Bucket**: _Block Public Access_ ligado em todas as opções, criptografia SSE-S3 (padrão), sem ACLs (_Object Ownership: bucket owner enforced_). Política negando requisições sem TLS (`aws:SecureTransport = false`).
- **CORS** do bucket, necessário porque o navegador posta direto no S3:

  ```json
  [
    {
      "AllowedOrigins": ["https://app.exemplo.com"],
      "AllowedMethods": ["POST", "GET"],
      "AllowedHeaders": ["*"],
      "MaxAgeSeconds": 3000
    }
  ]
  ```

- **Role da Lambda**: só o necessário, restrito ao bucket. `HeadObject` é autorizado por `s3:GetObject`.

  ```json
  {
    "Effect": "Allow",
    "Action": ["s3:PutObject", "s3:GetObject"],
    "Resource": "arn:aws:s3:::<bucket>/*"
  }
  ```

  A URL/formulário pré-assinado age com as permissões de quem assinou (a role), por isso `s3:PutObject` é necessário mesmo sem a API enviar bytes. Com `S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY` vazios, o SDK usa a cadeia padrão de credenciais (variáveis temporárias da role na Lambda).

- **Rede**: se a Lambda estiver numa VPC (para falar com o RDS), o acesso ao S3 vai por um **VPC Gateway Endpoint** de S3 — gratuito, sem NAT Gateway. O upload e o download em si não passam pela VPC: vão do navegador direto ao S3.
- Sem `S3_ENDPOINT`, `S3_PUBLIC_ENDPOINT` e `S3_FORCE_PATH_STYLE` na AWS.
- **Custo**: armazenamento e requisições do S3 entram no free tier nos primeiros 12 meses (5 GB); depois, centavos para o volume de um portfólio.
