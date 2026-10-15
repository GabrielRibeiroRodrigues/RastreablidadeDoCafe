import { applyDecorators, type Type as ClassType } from '@nestjs/common';
import {
  ApiExtraModels,
  ApiOkResponse,
  ApiProperty,
  ApiPropertyOptional,
  getSchemaPath,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export const MAX_PAGE_SIZE = 100;

/** Situação do cadastro na listagem (cadastros são desativados, nunca apagados). */
export const RECORD_STATUSES = ['active', 'inactive', 'all'] as const;
export type RecordStatus = (typeof RECORD_STATUSES)[number];

/** Parâmetros comuns de listagem: paginação por página (adequada a tabelas de cadastro). */
export class PageQueryDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ minimum: 1, maximum: MAX_PAGE_SIZE, default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  pageSize = 20;

  @ApiPropertyOptional({ enum: RECORD_STATUSES, default: 'active' })
  @IsOptional()
  @IsIn(RECORD_STATUSES)
  status: RecordStatus = 'active';
}

export class PageMeta {
  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  pageSize!: number;

  @ApiProperty({ example: 42 })
  total!: number;

  @ApiProperty({ example: 3 })
  totalPages!: number;
}

export interface Page<T> {
  data: T[];
  meta: PageMeta;
}

/** `skip`/`take` do Prisma a partir da página pedida. */
export function pageArgs({ page, pageSize }: PageQueryDto): { skip: number; take: number } {
  return { skip: (page - 1) * pageSize, take: pageSize };
}

export function toPage<T>(data: T[], total: number, { page, pageSize }: PageQueryDto): Page<T> {
  return { data, meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } };
}

/** `'name'` → `{ name: 'asc' }`; `'-name'` → `{ name: 'desc' }`. Desempate estável por id. */
export function orderBy<F extends string>(
  sort: F | `-${F}`,
): Array<Record<string, 'asc' | 'desc'>> {
  const desc = sort.startsWith('-');
  const field = desc ? sort.slice(1) : sort;
  return [{ [field]: desc ? 'desc' : 'asc' }, { id: 'asc' }];
}

/** Filtro de `isActive` a partir de `status`. */
export function statusFilter(status: RecordStatus): { isActive?: boolean } {
  return status === 'all' ? {} : { isActive: status === 'active' };
}

/** Documenta no OpenAPI uma resposta `{ data: Model[], meta: PageMeta }`. */
export function ApiPageResponse(model: ClassType) {
  return applyDecorators(
    ApiExtraModels(PageMeta, model),
    ApiOkResponse({
      schema: {
        type: 'object',
        required: ['data', 'meta'],
        properties: {
          data: { type: 'array', items: { $ref: getSchemaPath(model) } },
          meta: { $ref: getSchemaPath(PageMeta) },
        },
      },
    }),
  );
}
