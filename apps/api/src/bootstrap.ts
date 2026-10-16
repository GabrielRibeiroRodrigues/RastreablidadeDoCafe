import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { ProblemDetailsFilter } from './common/http/problem-details.filter.js';
import { createValidationPipe } from './common/http/validation.js';
import { REQUEST_ID_HEADER } from './common/logging/request-id.js';
import type { Env } from './config/env.js';

export const API_PREFIX = 'v1';

/** Limite do corpo JSON/form. Importação CSV tem limite próprio (2 MB, lido no controller). */
export const JSON_BODY_LIMIT = '1mb';

/** Headers de resposta que o front (outra origem) precisa ler. */
const EXPOSED_HEADERS = [
  REQUEST_ID_HEADER,
  'Content-Disposition',
  'Idempotent-Replayed',
  'Retry-After',
  'X-Report-Rows',
  'X-Report-Truncated',
];

/** Configuração HTTP compartilhada entre main.ts, testes e o handler da Lambda. */
export function configureApp(app: INestApplication): void {
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  const swaggerEnabled = config.get('SWAGGER_ENABLED', { infer: true });

  app.useLogger(app.get(Logger));

  // Atrás de API Gateway/ALB, `req.ip` (logs e rate limit) precisa vir do X-Forwarded-For.
  const express = app as NestExpressApplication;
  express.set('trust proxy', config.get('TRUST_PROXY', { infer: true }));
  express.disable('x-powered-by');
  express.useBodyParser('json', { limit: JSON_BODY_LIMIT });
  express.useBodyParser('urlencoded', { limit: JSON_BODY_LIMIT, extended: true });

  app.use(
    helmet({
      // API pura: nada de HTML, exceto o Swagger UI (que precisa da CSP padrão do helmet).
      contentSecurityPolicy: swaggerEnabled
        ? undefined
        : { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
    }),
  );
  app.enableCors({
    origin: config.get('CORS_ORIGINS', { infer: true }),
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'],
    exposedHeaders: EXPOSED_HEADERS,
    maxAge: 600,
  });
  app.setGlobalPrefix(API_PREFIX);
  app.useGlobalPipes(createValidationPipe());
  app.useGlobalFilters(new ProblemDetailsFilter());
  app.enableShutdownHooks();

  if (swaggerEnabled) {
    SwaggerModule.setup('docs', app, () => createOpenApiDocument(app));
  }
}

export function createOpenApiDocument(app: INestApplication): OpenAPIObject {
  return SwaggerModule.createDocument(app, openApiOptions());
}

export function openApiOptions() {
  return new DocumentBuilder()
    .setTitle('TraceFlow API')
    .setDescription('Rastreabilidade de lotes de café')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
}
