import { SFNClient, StartExecutionCommand } from '@aws-sdk/client-sfn';
import { RecallStepStatus, type RecallStepName } from '../../generated/prisma/client.js';
import { RECALL_STEPS, type RecallStepsService } from './recall-steps.service.js';

export interface RecallRun {
  id: string;
  companyId: string;
  number: string;
}

/** Entrada da state machine (contrato com `infra/`): cada estado chama a Lambda de etapa. */
export interface RecallStateMachineInput {
  recallId: string;
  companyId: string;
  /** Ordem das etapas; as já concluídas retornam na hora (idempotentes). */
  steps: readonly RecallStepName[];
}

/**
 * Quem orquestra as etapas do recall. Duas implementações com o mesmo contrato:
 * - `LocalRecallRunner`: no próprio processo, em sequência (padrão local e testes);
 * - `StepFunctionsRecallRunner`: inicia uma execução da state machine na AWS.
 */
export interface RecallRunner {
  readonly kind: 'LOCAL' | 'STEP_FUNCTIONS';
  /** Devolve o ARN da execução quando a orquestração é externa. */
  start(recall: RecallRun): Promise<{ executionArn?: string }>;
}

export const RECALL_RUNNER = Symbol('RECALL_RUNNER');

/** Roda as etapas em sequência e para na primeira que falhar (o estado fica gravado). */
export class LocalRecallRunner implements RecallRunner {
  readonly kind = 'LOCAL' as const;

  constructor(private readonly steps: RecallStepsService) {}

  async start(recall: RecallRun): Promise<{ executionArn?: string }> {
    for (const step of RECALL_STEPS) {
      const status = await this.steps.runStep(recall.id, step);
      if (status === RecallStepStatus.FAILED) break;
    }
    return {};
  }
}

/**
 * Inicia a state machine (`RECALL_STATE_MACHINE_ARN`). A resposta HTTP volta com o recall em
 * EXECUTING; cada estado invoca `src/jobs/recall-step.job.ts`, que grava o progresso no banco.
 */
export class StepFunctionsRecallRunner implements RecallRunner {
  readonly kind = 'STEP_FUNCTIONS' as const;

  constructor(
    private readonly stateMachineArn: string,
    private readonly client: SFNClient = new SFNClient({}),
  ) {}

  async start(recall: RecallRun): Promise<{ executionArn?: string }> {
    const input: RecallStateMachineInput = {
      recallId: recall.id,
      companyId: recall.companyId,
      steps: RECALL_STEPS,
    };
    const out = await this.client.send(
      new StartExecutionCommand({
        stateMachineArn: this.stateMachineArn,
        // Nome único por tentativa (até 80 caracteres: letras, dígitos, - e _).
        name: `${recall.number}-${Date.now()}`.slice(0, 80),
        input: JSON.stringify(input),
      }),
    );
    return out.executionArn ? { executionArn: out.executionArn } : {};
  }
}
