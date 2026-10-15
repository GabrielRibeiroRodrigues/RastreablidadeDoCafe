import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from '../app.module.js';

let context: Promise<INestApplicationContext> | undefined;

/**
 * Contexto Nest (sem HTTP) compartilhado entre invocações da mesma instância da Lambda:
 * o bootstrap (DI, pool do Postgres, clientes AWS) só acontece no cold start.
 */
export function jobContext(): Promise<INestApplicationContext> {
  context ??= NestFactory.createApplicationContext(AppModule, { bufferLogs: true }).then(
    (app) => {
      app.useLogger(app.get(Logger));
      return app;
    },
    (error: unknown) => {
      // Falha no bootstrap não fica em cache: a próxima invocação tenta de novo.
      context = undefined;
      throw error;
    },
  );
  return context;
}
