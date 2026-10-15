import { ApiProperty } from '@nestjs/swagger';
import { LotStatus, ProductionStage, SupplierType, Unit } from '../../generated/prisma/client.js';
import { ProductSummary } from '../inventory/inventory.dto.js';

export class TraceSupplier {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'José Aparecido da Silva' }) name!: string;
  @ApiProperty({ enum: SupplierType, enumName: 'SupplierType' }) type!: SupplierType;
  @ApiProperty({ type: String, nullable: true, example: 'Sítio Santa Inês' }) farmName!:
    string | null;
  @ApiProperty({ type: String, nullable: true, example: 'Mantiqueira de Minas' }) region!:
    string | null;
  @ApiProperty({ type: String, nullable: true, example: 'Carmo de Minas' }) city!: string | null;
  @ApiProperty({ type: String, nullable: true, example: 'MG' }) state!: string | null;
  @ApiProperty({ type: Number, nullable: true, example: 1250 }) altitudeMeters!: number | null;
}

/** Lote no grafo de rastreabilidade. `depth`: distância até o lote consultado (0 = ele mesmo). */
export class TraceNode {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'CAF-2026-000123' }) code!: string;
  @ApiProperty({ enum: LotStatus, enumName: 'LotStatus' }) status!: LotStatus;
  @ApiProperty({ type: ProductSummary }) product!: ProductSummary;
  @ApiProperty({ enum: Unit, enumName: 'Unit' }) unit!: Unit;
  @ApiProperty({ example: '60.000' }) initialQuantity!: string;
  @ApiProperty({ type: String, nullable: true, example: '2025/26' }) harvest!: string | null;
  @ApiProperty({ type: String, nullable: true, example: 'Bourbon Amarelo' }) variety!:
    string | null;
  @ApiProperty() receivedAt!: Date;
  @ApiProperty({ type: TraceSupplier, nullable: true }) supplier!: TraceSupplier | null;
  @ApiProperty({ example: 1 }) depth!: number;
}

export class TraceProductionOrder {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'OP-2026-000001' }) number!: string;
  @ApiProperty({ enum: ProductionStage, enumName: 'ProductionStage' }) stage!: ProductionStage;
  @ApiProperty() performedAt!: Date;
}

/** Aresta pai → filho: o filho consumiu `quantity` (unidade do pai) do pai na ordem indicada. */
export class TraceEdge {
  @ApiProperty({ format: 'uuid' }) parentLotId!: string;
  @ApiProperty({ format: 'uuid' }) childLotId!: string;
  @ApiProperty({ example: '10.000' }) quantity!: string;
  @ApiProperty({ type: TraceProductionOrder }) productionOrder!: TraceProductionOrder;
}

export class TraceCustomer {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'Cafeteria Grão Fino' }) name!: string;
  @ApiProperty({ type: String, nullable: true }) city!: string | null;
  @ApiProperty({ type: String, nullable: true }) state!: string | null;
}

export class TraceShipment {
  @ApiProperty({ format: 'uuid' }) shipmentId!: string;
  @ApiProperty({ example: 'EXP-2026-000001' }) number!: string;
  @ApiProperty() shippedAt!: Date;
  @ApiProperty({ type: String, nullable: true }) orderRef!: string | null;
  @ApiProperty({ type: TraceCustomer }) customer!: TraceCustomer;
  @ApiProperty({ format: 'uuid' }) lotId!: string;
  @ApiProperty({ example: 'CAF-2026-000130' }) lotCode!: string;
  @ApiProperty({ example: '12.000' }) quantity!: string;
  @ApiProperty({ enum: Unit, enumName: 'Unit' }) unit!: Unit;
}

class TraceGraph {
  @ApiProperty({ format: 'uuid' }) rootLotId!: string;
  @ApiProperty({ type: [TraceNode], description: 'Inclui o próprio lote (depth 0)' })
  nodes!: TraceNode[];
  @ApiProperty({ type: [TraceEdge] }) edges!: TraceEdge[];
  @ApiProperty({ description: 'true se o limite de profundidade cortou o grafo' })
  truncated!: boolean;
}

/** Para trás: de onde veio — até os lotes recebidos e suas fazendas. */
export class BackwardTraceResponse extends TraceGraph {
  @ApiProperty({
    type: [TraceSupplier],
    description: 'Fornecedores/fazendas de origem (distintos)',
  })
  origins!: TraceSupplier[];
}

/** Para frente: onde foi usado e para quem foi expedido — base do recall. */
export class ForwardTraceResponse extends TraceGraph {
  @ApiProperty({ type: [TraceShipment], description: 'Expedições do lote e de todos os derivados' })
  shipments!: TraceShipment[];
  @ApiProperty({ type: [TraceCustomer], description: 'Clientes afetados (distintos)' })
  customers!: TraceCustomer[];
}
