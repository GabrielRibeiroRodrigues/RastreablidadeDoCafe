import 'reflect-metadata';
import { configure as serverlessExpress } from '@codegenie/serverless-express';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyStructuredResultV2,
  Context,
  Handler,
} from 'aws-lambda';
import { AppModule } from './app.module.js';
import { configureApp } from './bootstrap.js';
import { loadRuntimeSecrets } from './lambda/runtime-secrets.js';

type HttpHandler = Handler<APIGatewayProxyEventV2, APIGatewayProxyStructuredResultV2>;

/**
 * Entrada da API na Lambda (API Gateway HTTP API, payload v2). O app Nest é criado uma única
 * vez por ambiente de execução e reaproveitado nas invocações seguintes (warm start).
 */
let server: Promise<HttpHandler> | undefined;

async function bootstrap(): Promise<HttpHandler> {
  await loadRuntimeSecrets();

  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  configureApp(app);
  await app.init();

  return serverlessExpress({
    app: app.getHttpAdapter().getInstance(),
    // PDFs de etiqueta e arquivos gerados pela API voltam em base64 para o API Gateway.
    binarySettings: { contentTypes: ['application/pdf', 'image/*', 'application/octet-stream'] },
  });
}

export async function handler(
  event: APIGatewayProxyEventV2,
  context: Context,
): Promise<APIGatewayProxyStructuredResultV2> {
  // O pool do Postgres mantém sockets abertos: não esperar o event loop esvaziar.
  context.callbackWaitsForEmptyEventLoop = false;

  server ??= bootstrap().catch((error: unknown) => {
    // Falha no boot (env inválido, banco fora): a próxima invocação tenta de novo.
    server = undefined;
    throw error;
  });
  const proxy = await server;
  // serverless-express devolve uma Promise quando nenhum callback é usado.
  return (await proxy(event, context, () => undefined)) as APIGatewayProxyStructuredResultV2;
}
