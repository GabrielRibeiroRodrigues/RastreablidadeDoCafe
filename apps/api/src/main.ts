import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { Server } from 'node:http';
import { AppModule } from './app.module.js';
import { configureApp } from './bootstrap.js';
import type { Env } from './config/env.js';

const app = await NestFactory.create(AppModule, { bufferLogs: true });
configureApp(app);

const port = app.get<ConfigService<Env, true>>(ConfigService).get('PORT', { infer: true });
await app.listen(port, '0.0.0.0');

// Atrás de um ALB (idle timeout padrão de 60 s), o keep-alive do Node precisa ser maior,
// senão o balanceador reaproveita conexões já fechadas e devolve 502 esporádicos.
const server = app.getHttpServer() as Server;
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;
