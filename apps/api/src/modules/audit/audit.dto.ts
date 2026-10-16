import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsDateString, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { PagingDto } from '../../common/http/pagination.js';
import { trim } from '../../common/http/transforms.js';

export class ListAuditLogsQueryDto extends PagingDto {
  @ApiPropertyOptional({ example: 'lot', description: 'Tipo da entidade (lot, recall, ...)' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(60)
  entityType?: string;

  @ApiPropertyOptional({ description: 'Id da entidade' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(64)
  entityId?: string;

  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  userId?: string;

  @ApiPropertyOptional({
    example: 'lot.status_changed',
    description: 'Ação exata, ou prefixo terminado em ponto (ex.: `recall.`)',
  })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(80)
  action?: string;

  @ApiPropertyOptional({ format: 'date-time', description: 'A partir de (inclusive)' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ format: 'date-time', description: 'Até (exclusive)' })
  @IsOptional()
  @IsDateString()
  to?: string;
}

export class AuditUser {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'Ana Souza' }) name!: string;
}

export class AuditLogResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'lot.status_changed' }) action!: string;
  @ApiProperty({ example: 'lot' }) entityType!: string;
  @ApiProperty({ type: String, nullable: true }) entityId!: string | null;
  @ApiProperty({ type: AuditUser, nullable: true, description: 'Null para jobs agendados' })
  user!: AuditUser | null;
  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    nullable: true,
    description: 'Estado antes da operação',
  })
  before!: unknown;
  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    nullable: true,
    description: 'Estado depois da operação',
  })
  after!: unknown;
  @ApiProperty({ type: String, nullable: true }) requestId!: string | null;
  @ApiProperty({ type: String, nullable: true }) ip!: string | null;
  @ApiProperty() createdAt!: Date;
}
