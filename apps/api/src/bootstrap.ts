import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule, type OpenAPIObject } from '@nestjs/swagger';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { ProblemDetailsFilter } from './common/http/problem-details.filter.js';
import { createValidationPipe } from './common/http/validation.js';
import { REQUEST_ID_HEADER } from './common/logging/request-id.js';
import type { Env } from './config/env.js';

export const API_PREFIX = 'v1';

/** Configuração HTTP compartilhada entre main.ts, testes e (depois) o handler da Lambda. */
export function configureApp(app: INestApplication): void {
  const config = app.get<ConfigService<Env, true>>(ConfigService);

  app.useLogger(app.get(Logger));
  app.use(helmet());
  app.enableCors({
    origin: config.get('CORS_ORIGINS', { infer: true }),
    exposedHeaders: [REQUEST_ID_HEADER],
  });
  app.setGlobalPrefix(API_PREFIX);
  app.useGlobalPipes(createValidationPipe());
  app.useGlobalFilters(new ProblemDetailsFilter());
  app.enableShutdownHooks();

  if (config.get('SWAGGER_ENABLED', { infer: true })) {
    SwaggerModule.setup('docs', app, () => createOpenApiDocument(app));
  }
}

export function createOpenApiDocument(app: INestApplication): OpenAPIObject {
  const options = new DocumentBuilder()
    .setTitle('TraceFlow API')
    .setDescription('Rastreabilidade de lotes de café')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  return SwaggerModule.createDocument(app, options);
}
