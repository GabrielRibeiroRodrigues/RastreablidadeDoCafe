import { Global, Module } from '@nestjs/common';
import { ClsModule } from 'nestjs-cls';
import { TenantContext } from './tenant-context.js';
import { TenantPrismaService } from './tenant-prisma.service.js';

@Global()
@Module({
  imports: [
    // Um contexto por requisição HTTP; a empresa é gravada nele após a autenticação.
    ClsModule.forRoot({ global: true, middleware: { mount: true } }),
  ],
  providers: [TenantContext, TenantPrismaService],
  exports: [TenantContext, TenantPrismaService],
})
export class TenancyModule {}
