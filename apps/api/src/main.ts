import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureApp } from './bootstrap.js';
import type { Env } from './config/env.js';

const app = await NestFactory.create(AppModule, { bufferLogs: true });
configureApp(app);

const port = app.get<ConfigService<Env, true>>(ConfigService).get('PORT', { infer: true });
await app.listen(port, '0.0.0.0');
