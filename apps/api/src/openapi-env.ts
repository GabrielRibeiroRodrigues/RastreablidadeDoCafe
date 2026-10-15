/**
 * Ambiente fictício para gerar o OpenAPI sem `.env` (CI, worktree novo).
 *
 * Precisa ser um módulo separado e importado PRIMEIRO em `openapi.ts`: em ESM os `import` são
 * avaliados antes do corpo do arquivo, e o `ConfigModule.forRoot()` valida o env já na importação
 * do `AppModule`.
 */
process.env['DATABASE_URL'] ??= 'postgresql://openapi:openapi@localhost:1/openapi';
// AUTH_MODE=mock inclui os endpoints /dev no contrato (o front os usa em desenvolvimento).
process.env['AUTH_MODE'] = 'mock';
process.env['NODE_ENV'] = 'development';
// Anexos aparecem no contrato independentemente de haver bucket configurado.
process.env['S3_BUCKET'] ??= 'openapi';
