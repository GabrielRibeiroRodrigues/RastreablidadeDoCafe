import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module.js';
import { LoggingModule } from './common/logging/logging.module.js';
import { validateEnv } from './config/env.js';
import { HealthModule } from './health/health.module.js';
import { CompaniesModule } from './modules/companies/companies.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { TenancyModule } from './tenancy/tenancy.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true, validate: validateEnv }),
    LoggingModule,
    PrismaModule,
    TenancyModule,
    AuthModule,
    CompaniesModule,
    HealthModule,
  ],
})
export class AppModule {}
