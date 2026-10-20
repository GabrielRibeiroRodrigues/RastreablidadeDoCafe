import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';
import { PagingDto } from '../../common/http/pagination.js';
import { trim } from '../../common/http/transforms.js';
import {
  LotStatus,
  RecallSeverity,
  RecallStatus,
  RecallStepName,
  RecallStepStatus,
  Unit,
} from '../../generated/prisma/client.js';
import { ProductSummary } from '../inventory/inventory.dto.js';
import { TraceCustomer, TraceShipment, TraceSupplier } from '../trace/trace.dto.js';

// ───────────── Entrada ─────────────

export class SimulateRecallDto {
  @ApiProperty({ format: 'uuid', description: 'Lote de origem do problema' })
  @IsUUID()
  lotId!: string;
}

export class CreateRecallDto {
  @ApiProperty({ format: 'uuid', description: 'Lote de origem do problema' })
  @IsUUID()
  lotId!: string;

  @ApiProperty({ example: 'Ocratoxina acima do limite no laudo do lote verde' })
  @Transform(trim)
  @IsString()
  @MinLength(5)
  @MaxLength(2000)
  reason!: string;

  @ApiProperty({ enum: RecallSeverity, enumName: 'RecallSeverity' })
  @IsEnum(RecallSeverity)
  severity!: RecallSeverity;
}

export class CloseRecallDto {
  @ApiProperty({ example: 'Clientes contatados; estoque recolhido e destinado à destruição' })
  @Transform(trim)
  @IsString()
  @MinLength(5)
  @MaxLength(2000)
  notes!: string;

  @ApiPropertyOptional({
    default: false,
    description:
      'Libera os lotes ainda bloqueados por este recall (voltam ao status anterior ao bloqueio; sem saldo, ficam consumidos). Lotes em outro recall aberto continuam bloqueados.',
  })
  @IsOptional()
  @IsBoolean()
  releaseLots?: boolean;
}

export class ListRecallsQueryDto extends PagingDto {
  @ApiPropertyOptional({ enum: RecallStatus, enumName: 'RecallStatus' })
  @IsOptional()
  @IsEnum(RecallStatus)
  status?: RecallStatus;

  @ApiPropertyOptional({ format: 'uuid', description: 'Lote de origem' })
  @IsOptional()
  @IsUUID()
  lotId?: string;
}

// ───────────── Simulação ─────────────

export class UnitQuantity {
  @ApiProperty({ enum: Unit, enumName: 'Unit' }) unit!: Unit;
  @ApiProperty({ example: '120.000' }) quantity!: string;
}

export class AffectedLot {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'CAF-2026-000013' }) code!: string;
  @ApiProperty({ enum: LotStatus, enumName: 'LotStatus' }) status!: LotStatus;
  @ApiProperty({ type: ProductSummary }) product!: ProductSummary;
  @ApiProperty({ enum: Unit, enumName: 'Unit' }) unit!: Unit;
  @ApiProperty({ example: '12.000', description: 'Saldo atual' }) balance!: string;
  @ApiProperty({ example: 2, description: 'Distância até o lote de origem (0 = ele mesmo)' })
  depth!: number;
}

export class AffectedCustomer {
  @ApiProperty({ type: TraceCustomer }) customer!: TraceCustomer;
  @ApiProperty({ example: 2 }) shipmentsCount!: number;
  @ApiProperty({ type: [String], example: ['EXP-2026-000003'] }) shipmentNumbers!: string[];
  @ApiProperty({ type: [UnitQuantity], description: 'Quantidade recebida, por unidade' })
  quantities!: UnitQuantity[];
}

export class RecallTotals {
  @ApiProperty({ example: 4 }) lots!: number;
  @ApiProperty({ example: 2 }) lotsWithStock!: number;
  @ApiProperty({ example: 3 }) shipments!: number;
  @ApiProperty({ example: 1 }) customers!: number;
  @ApiProperty({ type: [UnitQuantity], description: 'Saldo em estoque dos lotes afetados' })
  stock!: UnitQuantity[];
  @ApiProperty({ type: [UnitQuantity], description: 'Quantidade já expedida a clientes' })
  shipped!: UnitQuantity[];
}

/** Impacto de um recall: o que seria bloqueado e quem precisaria ser avisado. Não grava nada. */
export class RecallSimulationResponse {
  @ApiProperty({ type: AffectedLot }) originLot!: AffectedLot;
  @ApiProperty({ type: [TraceSupplier], description: 'Fazendas/fornecedores de origem' })
  origins!: TraceSupplier[];
  @ApiProperty({ type: [AffectedLot], description: 'Lote de origem e todos os derivados' })
  lots!: AffectedLot[];
  @ApiProperty({ type: [TraceShipment] }) shipments!: TraceShipment[];
  @ApiProperty({ type: [AffectedCustomer] }) customers!: AffectedCustomer[];
  @ApiProperty({ type: RecallTotals }) totals!: RecallTotals;
  @ApiProperty({ description: 'true se o limite de profundidade cortou o grafo' })
  truncated!: boolean;
}

// ───────────── Recall ─────────────

export class RecallUser {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'Ana Souza' }) name!: string;
}

export class RecallLotRef {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'CAF-2026-000009' }) code!: string;
}

export class RecallResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'RC-2026-000001' }) number!: string;
  @ApiProperty({ type: RecallLotRef }) originLot!: RecallLotRef;
  @ApiProperty() reason!: string;
  @ApiProperty({ enum: RecallSeverity, enumName: 'RecallSeverity' }) severity!: RecallSeverity;
  @ApiProperty({ enum: RecallStatus, enumName: 'RecallStatus' }) status!: RecallStatus;
  @ApiProperty({ example: 4 }) lotsCount!: number;
  @ApiProperty({ example: 1 }) customersCount!: number;
  @ApiProperty({ type: RecallUser }) createdBy!: RecallUser;
  @ApiProperty() createdAt!: Date;
  @ApiProperty({ type: Date, nullable: true }) startedAt!: Date | null;
  @ApiProperty({ type: Date, nullable: true }) completedAt!: Date | null;
  @ApiProperty({ type: Date, nullable: true }) closedAt!: Date | null;
}

export class RecallStepResponse {
  @ApiProperty({ enum: RecallStepName, enumName: 'RecallStepName' }) name!: RecallStepName;
  @ApiProperty({ example: 1 }) position!: number;
  @ApiProperty({ enum: RecallStepStatus, enumName: 'RecallStepStatus' })
  status!: RecallStepStatus;
  @ApiProperty({ example: 1 }) attempts!: number;
  @ApiProperty({ type: Date, nullable: true }) startedAt!: Date | null;
  @ApiProperty({ type: Date, nullable: true }) finishedAt!: Date | null;
  @ApiProperty({ type: String, nullable: true }) error!: string | null;
  @ApiProperty({ type: 'object', additionalProperties: true, nullable: true })
  output!: unknown;
}

export class RecallLotResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'CAF-2026-000013' }) code!: string;
  @ApiProperty({ enum: LotStatus, enumName: 'LotStatus', description: 'Status atual' })
  status!: LotStatus;
  @ApiProperty({ type: ProductSummary }) product!: ProductSummary;
  @ApiProperty({ enum: Unit, enumName: 'Unit' }) unit!: Unit;
  @ApiProperty({ example: 1 }) depth!: number;
  @ApiProperty({ example: '12.000', description: 'Saldo na criação do recall' }) balance!: string;
  @ApiProperty({ enum: LotStatus, enumName: 'LotStatus', nullable: true })
  previousStatus!: LotStatus | null;
  @ApiProperty({ type: Date, nullable: true }) blockedAt!: Date | null;
}

export class RecallCustomerContact extends TraceCustomer {
  @ApiProperty({ type: String, nullable: true }) email!: string | null;
  @ApiProperty({ type: String, nullable: true }) phone!: string | null;
}

export class RecallCustomerResponse {
  @ApiProperty({ type: RecallCustomerContact }) customer!: RecallCustomerContact;
  @ApiProperty({ example: 2 }) shipmentsCount!: number;
  @ApiProperty({ type: [String] }) shipmentNumbers!: string[];
  @ApiProperty({ type: [UnitQuantity] }) quantities!: UnitQuantity[];
}

export class RecallDetailResponse extends RecallResponse {
  @ApiProperty({ enum: ['LOCAL', 'STEP_FUNCTIONS'] }) orchestration!: 'LOCAL' | 'STEP_FUNCTIONS';
  @ApiProperty({ type: String, nullable: true }) lastError!: string | null;
  @ApiProperty({ description: 'Relatório PDF disponível em /recalls/{id}/report' })
  hasReport!: boolean;
  @ApiProperty({ type: String, nullable: true }) closingNotes!: string | null;
  @ApiProperty({ type: RecallUser, nullable: true }) closedBy!: RecallUser | null;
  @ApiProperty({ type: [RecallStepResponse] }) steps!: RecallStepResponse[];
  @ApiProperty({ type: [RecallLotResponse] }) lots!: RecallLotResponse[];
  @ApiProperty({ type: [RecallCustomerResponse] }) customers!: RecallCustomerResponse[];
}

export class RecallReportResponse {
  @ApiProperty({ description: 'URL pré-assinada do PDF (curta duração)' }) url!: string;
  @ApiProperty() expiresAt!: Date;
}
