/**
 * Gera o contrato OpenAPI sem subir servidor nem conectar no banco (modo preview do Nest).
 * Saída: packages/shared/openapi.json — fonte do cliente tipado do front (verificado na CI).
 *
 * Uso: pnpm --filter @traceflow/api openapi
 */
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AppModule } from './app.module.js';
import { API_PREFIX, openApiOptions } from './bootstrap.js';

// Valores fictícios: em preview nenhum provider é instanciado, mas o env precisa validar.
// AUTH_MODE=mock inclui os endpoints /dev no contrato (o front os usa em desenvolvimento).
process.env['DATABASE_URL'] ??= 'postgresql://openapi:openapi@localhost:1/openapi';
process.env['AUTH_MODE'] = 'mock';
process.env['NODE_ENV'] = 'development';

const app = await NestFactory.create(AppModule, { preview: true, logger: false });
app.setGlobalPrefix(API_PREFIX);

const document = SwaggerModule.createDocument(app, openApiOptions());
const output = resolve(import.meta.dirname, '../../../packages/shared/openapi.json');
writeFileSync(output, `${JSON.stringify(document, null, 2)}\n`);
await app.close();

console.log(`OpenAPI written to ${output} (${Object.keys(document.paths).length} paths)`);
