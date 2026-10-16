import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module.js';
import { ReportsController } from './reports.controller.js';
import { ReportsService } from './reports.service.js';

/** Relatórios CSV (docs/relatorios-importacao.md). */
@Module({
  imports: [InventoryModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
