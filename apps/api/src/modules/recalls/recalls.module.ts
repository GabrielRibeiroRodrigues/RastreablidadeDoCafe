import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.js';
import { StorageModule } from '../../storage/storage.module.js';
import { InventoryModule } from '../inventory/inventory.module.js';
import { TraceModule } from '../trace/trace.module.js';
import { RecallImpactService } from './recall-impact.service.js';
import {
  LocalRecallRunner,
  RECALL_RUNNER,
  StepFunctionsRecallRunner,
  type RecallRunner,
} from './recall-runner.js';
import { RecallStepsService } from './recall-steps.service.js';
import { RecallWorkflow } from './recall-workflow.service.js';
import { RecallsController } from './recalls.controller.js';
import { RecallsService } from './recalls.service.js';

@Module({
  imports: [InventoryModule, TraceModule, StorageModule],
  controllers: [RecallsController],
  providers: [
    RecallImpactService,
    RecallStepsService,
    RecallWorkflow,
    RecallsService,
    {
      // Step Functions quando RECALL_STATE_MACHINE_ARN está definido; senão, no próprio processo.
      provide: RECALL_RUNNER,
      inject: [ConfigService, RecallStepsService],
      useFactory: (config: ConfigService<Env, true>, steps: RecallStepsService): RecallRunner => {
        const arn = config.get('RECALL_STATE_MACHINE_ARN', { infer: true });
        if (arn) return new StepFunctionsRecallRunner(arn);
        new Logger('RecallsModule').log('Recall workflow runs in-process (no state machine)');
        return new LocalRecallRunner(steps);
      },
    },
  ],
  // A Lambda de etapa (src/jobs/recall-step.job.ts) usa o mesmo serviço de etapas.
  exports: [RecallStepsService],
})
export class RecallsModule {}
