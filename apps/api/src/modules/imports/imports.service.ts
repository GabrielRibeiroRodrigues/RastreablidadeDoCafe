import { HttpStatus, Injectable } from '@nestjs/common';
import { plainToInstance, type ClassConstructor } from 'class-transformer';
import { validate } from 'class-validator';
import { CsvParseError, parseCsv, type CsvRecord } from '../../common/csv/csv.js';
import { DomainProblemException } from '../../common/http/domain-problem.exception.js';
import { flattenValidationErrors } from '../../common/http/validation.js';
import { ProductType, type Prisma } from '../../generated/prisma/client.js';
import {
  TenantPrismaService,
  type TenantTransaction,
} from '../../tenancy/tenant-prisma.service.js';
import { CreateCustomerDto } from '../customers/customers.dto.js';
import { CreateLocationDto } from '../locations/locations.dto.js';
import { CreateProductDto } from '../products/products.dto.js';
import { CreateSupplierDto } from '../suppliers/suppliers.dto.js';
import {
  IMPORT_MAX_ROWS,
  type ImportEntity,
  type ImportResult,
  type ImportRowError,
} from './imports.dto.js';

type Plain = Record<string, unknown>;

/**
 * Como importar cada cadastro: colunas do modelo (nomes dos campos da API, em inglês), validação
 * com o mesmo DTO do `POST`, chave única e gravação em lote.
 */
interface ImportSpec<T extends object> {
  dto: ClassConstructor<T>;
  columns: readonly string[];
  required: readonly string[];
  /** Colunas de enum: o valor é convertido para maiúsculas antes de validar. */
  enums?: readonly string[];
  /** Conversões de texto → tipo do DTO (números, listas). */
  convert?: (plain: Plain) => void;
  /** Regras além do DTO (as mesmas que o serviço aplica no `POST`). */
  check?: (dto: T) => Array<Omit<ImportRowError, 'line'>>;
  unique?: {
    field: keyof T & string;
    /** Valores já cadastrados na empresa (inclusive inativos). */
    existing: (db: TenantPrismaService, values: string[]) => Promise<string[]>;
  };
  createMany: (tx: TenantTransaction, rows: T[]) => Promise<number>;
}

const ROASTABLE = new Set<ProductType>([ProductType.ROASTED, ProductType.BLEND]);

const products: ImportSpec<CreateProductDto> = {
  dto: CreateProductDto,
  columns: ['sku', 'name', 'type', 'unit', 'defaultRoastLevel', 'description'],
  required: ['sku', 'name', 'type', 'unit'],
  enums: ['type', 'unit', 'defaultRoastLevel'],
  check: (dto) =>
    dto.defaultRoastLevel && !ROASTABLE.has(dto.type)
      ? [
          {
            field: 'defaultRoastLevel',
            messages: ['defaultRoastLevel is only allowed for ROASTED and BLEND products'],
          },
        ]
      : [],
  unique: {
    field: 'sku',
    existing: async (db, values) =>
      (
        await db.client.product.findMany({ where: { sku: { in: values } }, select: { sku: true } })
      ).map((row) => row.sku),
  },
  createMany: async (tx, rows) =>
    (await tx.product.createMany({ data: rows as Prisma.ProductCreateManyInput[] })).count,
};

const suppliers: ImportSpec<CreateSupplierDto> = {
  dto: CreateSupplierDto,
  columns: [
    'name',
    'type',
    'document',
    'farmName',
    'region',
    'city',
    'state',
    'altitudeMeters',
    'varieties',
    'email',
    'phone',
  ],
  required: ['name', 'type'],
  enums: ['type'],
  convert: (plain) => {
    const altitude = plain['altitudeMeters'];
    if (typeof altitude === 'string' && /^-?\d+$/.test(altitude)) {
      plain['altitudeMeters'] = Number(altitude);
    }
    // Variedades separadas por "|" (vírgula e ";" podem ser o separador do arquivo).
    if (typeof plain['varieties'] === 'string') {
      plain['varieties'] = plain['varieties'].split('|');
    }
  },
  unique: {
    field: 'document',
    existing: async (db, values) =>
      (
        await db.client.supplier.findMany({
          where: { document: { in: values } },
          select: { document: true },
        })
      ).flatMap((row) => (row.document ? [row.document] : [])),
  },
  createMany: async (tx, rows) =>
    (await tx.supplier.createMany({ data: rows as Prisma.SupplierCreateManyInput[] })).count,
};

const customers: ImportSpec<CreateCustomerDto> = {
  dto: CreateCustomerDto,
  columns: ['name', 'document', 'email', 'phone', 'city', 'state'],
  required: ['name'],
  unique: {
    field: 'document',
    existing: async (db, values) =>
      (
        await db.client.customer.findMany({
          where: { document: { in: values } },
          select: { document: true },
        })
      ).flatMap((row) => (row.document ? [row.document] : [])),
  },
  createMany: async (tx, rows) =>
    (await tx.customer.createMany({ data: rows as Prisma.CustomerCreateManyInput[] })).count,
};

const locations: ImportSpec<CreateLocationDto> = {
  dto: CreateLocationDto,
  columns: ['code', 'name', 'type', 'description'],
  required: ['code', 'name', 'type'],
  enums: ['type'],
  unique: {
    field: 'code',
    existing: async (db, values) =>
      (
        await db.client.location.findMany({
          where: { code: { in: values } },
          select: { code: true },
        })
      ).map((row) => row.code),
  },
  createMany: async (tx, rows) =>
    (await tx.location.createMany({ data: rows as Prisma.LocationCreateManyInput[] })).count,
};

const SPECS: Record<ImportEntity, ImportSpec<object>> = {
  products: products as unknown as ImportSpec<object>,
  suppliers: suppliers as unknown as ImportSpec<object>,
  customers: customers as unknown as ImportSpec<object>,
  locations: locations as unknown as ImportSpec<object>,
};

/** Colunas aceitas por cadastro (documentadas em docs/relatorios-importacao.md). */
export const IMPORT_COLUMNS = Object.fromEntries(
  Object.entries(SPECS).map(([entity, spec]) => [entity, spec.columns]),
) as Record<ImportEntity, readonly string[]>;

const invalidImport = (detail: string, extensions: Record<string, unknown> = {}) =>
  new DomainProblemException(
    '/problems/invalid-import',
    detail,
    HttpStatus.BAD_REQUEST,
    extensions,
  );

/**
 * Importação de cadastros por CSV: valida cada linha com o DTO do `POST` e a unicidade (no
 * arquivo e no banco). Com `dryRun=false` e nenhum erro, grava tudo numa transação.
 */
@Injectable()
export class ImportsService {
  constructor(private readonly db: TenantPrismaService) {}

  async run(entity: ImportEntity, csv: string, dryRun: boolean): Promise<ImportResult> {
    const spec = SPECS[entity];
    const records = this.parse(csv);
    const [header, ...rows] = records;
    if (!header) throw invalidImport('The file is empty: a header row is required.');
    if (rows.length > IMPORT_MAX_ROWS) {
      throw new DomainProblemException(
        '/problems/import-too-large',
        `The file has ${rows.length} data rows; the limit is ${IMPORT_MAX_ROWS}.`,
        HttpStatus.PAYLOAD_TOO_LARGE,
        { maxRows: IMPORT_MAX_ROWS },
      );
    }

    const result = (errors: ImportRowError[], invalidLines: number, created = 0): ImportResult => ({
      entity,
      dryRun,
      total: rows.length,
      valid: rows.length - invalidLines,
      invalid: invalidLines,
      created,
      errors,
    });

    const columns = header.cells.map((cell) => cell.trim());
    const headerErrors = checkHeader(columns, spec);
    if (headerErrors.length) return result(headerErrors, rows.length);

    const errors: ImportRowError[] = [];
    const validRows: Array<{ line: number; dto: object }> = [];
    for (const row of rows) {
      const { dto, errors: rowErrors } = await validateRow(row, columns, spec);
      if (rowErrors.length) errors.push(...rowErrors);
      else validRows.push({ line: row.line, dto });
    }

    errors.push(...(await this.checkUniqueness(spec, validRows)));
    const invalidLines = new Set(errors.map((error) => error.line)).size;

    if (dryRun || errors.length) return result(errors, invalidLines);

    // Objetos simples (o Prisma não precisa do protótipo do DTO).
    const dtos = validRows.map((row) => ({ ...row.dto }));
    const created = await this.db.transaction((tx) => spec.createMany(tx, dtos), {
      timeout: 20_000,
    });
    return result([], 0, created);
  }

  private parse(csv: string): CsvRecord[] {
    try {
      return parseCsv(csv);
    } catch (error) {
      if (error instanceof CsvParseError) {
        throw invalidImport(`Malformed CSV at line ${error.line}: ${error.message}.`, {
          line: error.line,
        });
      }
      throw error;
    }
  }

  /** Repetidos no arquivo (a partir da 2ª ocorrência) e já existentes na empresa. */
  private async checkUniqueness(
    spec: ImportSpec<object>,
    rows: Array<{ line: number; dto: object }>,
  ): Promise<ImportRowError[]> {
    if (!spec.unique) return [];
    const field: string = spec.unique.field;
    const keyOf = (dto: object) => (dto as Record<string, unknown>)[field];

    const errors: ImportRowError[] = [];
    const seen = new Map<string, number>();
    for (const row of rows) {
      const value = keyOf(row.dto);
      if (typeof value !== 'string' || !value) continue;
      const first = seen.get(value);
      if (first === undefined) seen.set(value, row.line);
      else errors.push({ line: row.line, field, messages: [`${field} repeats line ${first}`] });
    }

    const existing = new Set(
      seen.size ? await spec.unique.existing(this.db, [...seen.keys()]) : [],
    );
    for (const row of rows) {
      const value = keyOf(row.dto);
      if (typeof value === 'string' && existing.has(value)) {
        errors.push({ line: row.line, field, messages: [`${field} already exists`] });
      }
    }
    return errors.sort((a, b) => a.line - b.line);
  }
}

function checkHeader(columns: string[], spec: ImportSpec<object>): ImportRowError[] {
  const errors: ImportRowError[] = [];
  const seen = new Set<string>();
  for (const column of columns) {
    if (!spec.columns.includes(column)) {
      errors.push({
        line: 1,
        field: column || '(empty)',
        messages: [`unknown column; expected: ${spec.columns.join(', ')}`],
      });
    } else if (seen.has(column)) {
      errors.push({ line: 1, field: column, messages: ['duplicated column'] });
    }
    seen.add(column);
  }
  for (const column of spec.required) {
    if (!seen.has(column)) {
      errors.push({ line: 1, field: column, messages: ['required column is missing'] });
    }
  }
  return errors;
}

async function validateRow(
  row: CsvRecord,
  columns: string[],
  spec: ImportSpec<object>,
): Promise<{ dto: object; errors: ImportRowError[] }> {
  if (row.cells.length > columns.length) {
    return {
      dto: {},
      errors: [
        {
          line: row.line,
          field: 'row',
          messages: [`row has ${row.cells.length} cells but the header has ${columns.length}`],
        },
      ],
    };
  }

  // Célula vazia = campo não informado (opcional); enums aceitam minúsculas.
  const plain: Plain = {};
  columns.forEach((column, index) => {
    const value = row.cells[index]?.trim() ?? '';
    if (value === '') return;
    plain[column] = spec.enums?.includes(column) ? value.toUpperCase() : value;
  });
  spec.convert?.(plain);

  const dto = plainToInstance(spec.dto, plain);
  const validationErrors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
  const errors = flattenValidationErrors(validationErrors).map((error) => ({
    line: row.line,
    ...error,
  }));
  if (!errors.length && spec.check) {
    errors.push(...spec.check(dto).map((error) => ({ line: row.line, ...error })));
  }
  return { dto, errors };
}
