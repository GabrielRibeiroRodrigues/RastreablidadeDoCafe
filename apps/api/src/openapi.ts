/**
 * Gera o contrato OpenAPI sem subir servidor nem conectar no banco (modo preview do Nest).
 * Saída: packages/shared/openapi.json — fonte do cliente tipado do front (verificado na CI).
 *
 * Uso: pnpm --filter @traceflow/api openapi
 */
// Deve ser o primeiro import (ver openapi-env.ts).
import './openapi-env.js';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { AppModule } from './app.module.js';
import { API_PREFIX, openApiOptions } from './bootstrap.js';

const app = await NestFactory.create(AppModule, { preview: true, logger: false });
app.setGlobalPrefix(API_PREFIX);

const document = SwaggerModule.createDocument(app, openApiOptions());
const output = resolve(import.meta.dirname, '../../../packages/shared/openapi.json');
writeFileSync(output, `${JSON.stringify(document, null, 2)}\n`);
await app.close();

console.log(`OpenAPI written to ${output} (${Object.keys(document.paths).length} paths)`);
