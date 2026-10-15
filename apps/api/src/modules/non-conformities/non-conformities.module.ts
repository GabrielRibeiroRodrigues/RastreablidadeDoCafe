import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module.js';
import { NonConformitiesController } from './non-conformities.controller.js';
import { NonConformitiesService } from './non-conformities.service.js';

@Module({
  imports: [InventoryModule],
  controllers: [NonConformitiesController],
  providers: [NonConformitiesService],
})
export class NonConformitiesModule {}
