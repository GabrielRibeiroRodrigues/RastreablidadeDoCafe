import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module.js';
import { AttachmentsModule } from './modules/attachments/attachments.module.js';
import { LoggingModule } from './common/logging/logging.module.js';
import { validateEnv } from './config/env.js';
import { HealthModule } from './health/health.module.js';
import { CompaniesModule } from './modules/companies/companies.module.js';
import { CustomersModule } from './modules/customers/customers.module.js';
import { InventoryModule } from './modules/inventory/inventory.module.js';
import { LocationsModule } from './modules/locations/locations.module.js';
import { ProductsModule } from './modules/products/products.module.js';
import { ShipmentsModule } from './modules/shipments/shipments.module.js';
import { SuppliersModule } from './modules/suppliers/suppliers.module.js';
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
    ProductsModule,
    SuppliersModule,
    CustomersModule,
    LocationsModule,
    InventoryModule,
    ShipmentsModule,
    AttachmentsModule,
    HealthModule,
  ],
})
export class AppModule {}
