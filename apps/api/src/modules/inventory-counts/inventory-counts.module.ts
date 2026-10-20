import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module.js';
import { InventoryCountsController } from './inventory-counts.controller.js';
import { InventoryCountsService } from './inventory-counts.service.js';

@Module({
  imports: [InventoryModule],
  controllers: [InventoryCountsController],
  providers: [InventoryCountsService],
})
export class InventoryCountsModule {}
