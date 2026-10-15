import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module.js';
import { ProductionController } from './production.controller.js';
import { ProductionService } from './production.service.js';

@Module({
  imports: [InventoryModule],
  controllers: [ProductionController],
  providers: [ProductionService],
})
export class ProductionModule {}
