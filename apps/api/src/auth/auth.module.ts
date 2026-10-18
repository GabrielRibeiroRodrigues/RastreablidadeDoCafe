import { Module } from '@nestjs/common';
import { ConditionalModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { PassportModule } from '@nestjs/passport';
import { DevAuthModule } from './dev/dev-auth.module.js';
import { JwtAuthGuard, RolesGuard } from './guards.js';
import { JwtStrategy } from './jwt.strategy.js';
import { MeController } from './me.controller.js';
import { MockKeyModule } from './mock-key.module.js';

@Module({
  imports: [
    PassportModule,
    MockKeyModule,
    // Endpoints do emissor simulado só existem em AUTH_MODE=mock (e o env proíbe mock em produção).
    // O prazo conta desde a importação deste arquivo: com imports lentos (cold start, CI) os 5 s
    // padrão estouram e o timer lança uma exceção não tratada que derruba o processo.
    ConditionalModule.registerWhen(DevAuthModule, (env) => env['AUTH_MODE'] === 'mock', {
      timeout: 60_000,
    }),
  ],
  controllers: [MeController],
  providers: [
    JwtStrategy,
    // Ordem importa: autentica primeiro, depois checa perfis.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AuthModule {}
