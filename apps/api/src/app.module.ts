import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module.js';
import { AttachmentsModule } from './modules/attachments/attachments.module.js';
import { LoggingModule } from './common/logging/logging.module.js';
import { validateEnv } from './config/env.js';
import { HealthModule } from './health/health.module.js';
import { CompaniesModule } from './modules/companies/companies.module.js';
import { CustomersModule } from './modules/customers/customers.module.js';
import { DashboardModule } from './modules/dashboard/dashboard.module.js';
import { ImportsModule } from './modules/imports/imports.module.js';
import { InventoryModule } from './modules/inventory/inventory.module.js';
import { LabelsModule } from './modules/labels/labels.module.js';
import { LocationsModule } from './modules/locations/locations.module.js';
import { ProductionModule } from './modules/production/production.module.js';
import { ProductsModule } from './modules/products/products.module.js';
import { ReportsModule } from './modules/reports/reports.module.js';
import { ShipmentsModule } from './modules/shipments/shipments.module.js';
import { SuppliersModule } from './modules/suppliers/suppliers.module.js';
import { TraceModule } from './modules/trace/trace.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { PublicModule } from './public/public.module.js';
import { SecurityModule } from './security/security.module.js';
import { TenancyModule } from './tenancy/tenancy.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true, validate: validateEnv }),
    LoggingModule,
    SecurityModule,
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
    ProductionModule,
    TraceModule,
    LabelsModule,
    DashboardModule,
    ReportsModule,
    ImportsModule,
    PublicModule,
    HealthModule,
  ],
})
export class AppModule {}
