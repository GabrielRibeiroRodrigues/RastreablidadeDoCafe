import { Module } from '@nestjs/common';
import { MockKeyStore } from './mock-key-store.js';

/** Instância única do par de chaves: quem assina (DevAuth) e quem valida (JwtStrategy) é o mesmo. */
@Module({
  providers: [MockKeyStore],
  exports: [MockKeyStore],
})
export class MockKeyModule {}
