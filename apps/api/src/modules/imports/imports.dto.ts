import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

export const IMPORT_ENTITIES = ['products', 'suppliers', 'customers', 'locations'] as const;
export type ImportEntity = (typeof IMPORT_ENTITIES)[number];

/** Limites da importação (arquivo e linhas de dados). */
export const IMPORT_MAX_BYTES = 2 * 1024 * 1024;
export const IMPORT_MAX_ROWS = 5000;

const toBoolean = ({ value }: { value: unknown }): unknown => {
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  return value;
};

export class ImportQueryDto {
  @ApiPropertyOptional({
    type: Boolean,
    default: true,
    description: 'true: só valida. false: valida e, sem nenhum erro, grava tudo (tudo ou nada).',
  })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  dryRun = true;
}

export class ImportRowError {
  @ApiProperty({ example: 3, description: 'Linha do arquivo (1 = cabeçalho)' })
  line!: number;
  @ApiProperty({ example: 'sku', description: 'Coluna (ou `row` para a linha inteira)' })
  field!: string;
  @ApiProperty({ type: [String], example: ['sku already exists'] })
  messages!: string[];
}

export class ImportResult {
  @ApiProperty({ enum: IMPORT_ENTITIES, example: 'products' }) entity!: ImportEntity;
  @ApiProperty({ example: true }) dryRun!: boolean;
  @ApiProperty({ example: 120, description: 'Linhas de dados no arquivo' }) total!: number;
  @ApiProperty({ example: 118 }) valid!: number;
  @ApiProperty({ example: 2 }) invalid!: number;
  @ApiProperty({ example: 0, description: 'Registros gravados (0 em dry-run ou com erros)' })
  created!: number;
  @ApiProperty({ type: [ImportRowError] }) errors!: ImportRowError[];
}
