import { Module } from '@nestjs/common';
import { MockKeyModule } from '../mock-key.module.js';
import { DevAuthController } from './dev-auth.controller.js';

/** Emissor de tokens simulado para desenvolvimento local e testes (ADR 0005). */
@Module({
  imports: [MockKeyModule],
  controllers: [DevAuthController],
})
export class DevAuthModule {}
