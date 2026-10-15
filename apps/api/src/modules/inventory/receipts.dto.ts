import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsDateString, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { trimToNull } from '../../common/http/transforms.js';
import { LotQualityDto } from './lots.dto.js';
import { IsQuantity } from './quantity.js';

/** Recebimento de café de um fornecedor: cria o lote e a entrada no estoque. */
export class CreateReceiptDto extends LotQualityDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  productId!: string;

  @ApiPropertyOptional({ format: 'uuid', nullable: true, type: String })
  @IsOptional()
  @IsUUID()
  supplierId?: string | null;

  @ApiProperty({
    format: 'uuid',
    description: 'Local de destino (quarentena → lote em quarentena)',
  })
  @IsUUID()
  locationId!: string;

  @ApiProperty({ example: '60.000', description: 'Quantidade na unidade do produto' })
  @IsQuantity()
  quantity!: string;

  @ApiPropertyOptional({ description: 'Data/hora do recebimento (padrão: agora)' })
  @IsOptional()
  @IsDateString()
  receivedAt?: string;

  @ApiPropertyOptional({ type: String, nullable: true, example: 'NF 004512' })
  @IsOptional()
  @Transform(trimToNull)
  @IsString()
  @MaxLength(60)
  documentRef?: string | null;
}
