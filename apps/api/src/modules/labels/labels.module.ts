import { Module } from '@nestjs/common';
import { StorageModule } from '../../storage/storage.module.js';
import { TraceModule } from '../trace/trace.module.js';
import { LabelBatchController, LabelsController } from './labels.controller.js';
import { LabelsService } from './labels.service.js';

@Module({
  imports: [StorageModule, TraceModule],
  controllers: [LabelsController, LabelBatchController],
  providers: [LabelsService],
})
export class LabelsModule {}
