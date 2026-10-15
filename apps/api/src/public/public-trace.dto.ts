import { ApiProperty } from '@nestjs/swagger';
import { ProductionStage, ProductType, RoastLevel } from '../generated/prisma/client.js';

/**
 * Contrato da página pública de rastreio. Só dados publicáveis: nada de ids internos, quantidades,
 * clientes, usuários, documentos ou nome pessoal de produtor. Lotes são identificados pelo código.
 */

export class PublicOriginResponse {
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'Fazenda/cooperativa. Nulo quando a origem é um produtor sem fazenda cadastrada',
    example: 'Sítio Santa Inês',
  })
  name!: string | null;

  @ApiProperty({ type: String, nullable: true, example: 'Mantiqueira de Minas' })
  region!: string | null;

  @ApiProperty({ type: String, nullable: true, example: 'Carmo de Minas' })
  city!: string | null;

  @ApiProperty({ type: String, nullable: true, example: 'MG' })
  state!: string | null;

  @ApiProperty({ type: Number, nullable: true, example: 1250 })
  altitudeMeters!: number | null;
}

export class PublicLotResponse {
  @ApiProperty({ example: 'CAF-2026-000013' }) code!: string;
  @ApiProperty({ example: 'Blend da Casa' }) productName!: string;
  @ApiProperty({ enum: ProductType, enumName: 'ProductType' }) productType!: ProductType;
  @ApiProperty({ type: String, nullable: true, example: '2025/26' }) harvest!: string | null;
  @ApiProperty({ type: String, nullable: true, example: 'Bourbon Amarelo' }) variety!:
    string | null;
  @ApiProperty({ enum: RoastLevel, enumName: 'RoastLevel', nullable: true })
  roastLevel!: RoastLevel | null;
  @ApiProperty({ description: 'Data de recebimento (café verde) ou de produção/torra' })
  producedAt!: Date;
  @ApiProperty({ type: String, format: 'date', nullable: true, example: '2027-06-30' })
  expiresAt!: string | null;
  @ApiProperty({ type: Number, nullable: true, example: 86.5 }) cuppingScore!: number | null;
  @ApiProperty({
    description: 'true = disponível. Motivos de indisponibilidade (ex.: recall) não são expostos',
  })
  available!: boolean;
}

/** Um lote da cadeia (o próprio lote e seus antecessores). */
export class PublicTraceStep {
  @ApiProperty({ example: 'CAF-2026-000003' }) code!: string;
  @ApiProperty({ example: 'Café verde Bourbon Amarelo' }) productName!: string;
  @ApiProperty({ enum: ProductType, enumName: 'ProductType' }) productType!: ProductType;
  @ApiProperty({
    enum: ProductionStage,
    enumName: 'ProductionStage',
    nullable: true,
    description: 'Etapa que gerou o lote; nulo para lotes recebidos (colheita/recebimento)',
  })
  stage!: ProductionStage | null;
  @ApiProperty({ description: 'Recebimento ou produção' }) date!: Date;
  @ApiProperty({ type: String, nullable: true }) harvest!: string | null;
  @ApiProperty({ type: String, nullable: true }) variety!: string | null;
  @ApiProperty({ description: 'Distância até o lote consultado (0 = ele mesmo)', example: 2 })
  depth!: number;
  @ApiProperty({ type: [String], description: 'Códigos dos lotes usados para produzir este' })
  inputs!: string[];
  @ApiProperty({ type: PublicOriginResponse, nullable: true })
  origin!: PublicOriginResponse | null;
}

export class PublicTraceResponse {
  @ApiProperty({ example: 'Torrefação Serra Azul' }) companyName!: string;
  @ApiProperty({ type: PublicLotResponse }) lot!: PublicLotResponse;
  @ApiProperty({ type: [PublicOriginResponse], description: 'Fazendas/regiões de origem' })
  origins!: PublicOriginResponse[];
  @ApiProperty({
    type: [PublicTraceStep],
    description: 'Cadeia da origem até o lote (mais antigos primeiro)',
  })
  chain!: PublicTraceStep[];
  @ApiProperty({ description: 'true se a cadeia foi cortada pelo limite de profundidade' })
  truncated!: boolean;
}
