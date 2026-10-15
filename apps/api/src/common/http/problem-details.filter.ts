import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { STATUS_CODES } from 'node:http';
import { Prisma } from '../../generated/prisma/client.js';
import { DomainProblemException } from './domain-problem.exception.js';
import { ValidationProblemException, type FieldError } from './validation.js';

/** Corpo de erro no formato RFC 9457 (Problem Details for HTTP APIs). */
export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance?: string;
  requestId?: string;
  errors?: FieldError[];
  /** Membros de extensão (RFC 9457 §3.2), ex.: `available` em falta de estoque. */
  [extension: string]: unknown;
}

export const PROBLEM_CONTENT_TYPE = 'application/problem+json';

@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request & { id?: unknown }>();
    const res = ctx.getResponse<Response>();

    const problem = toProblem(exception);
    if (problem.status >= 500) {
      this.logger.error(exception);
    }

    const body: ProblemDetails = {
      ...problem,
      instance: req.originalUrl,
      ...(typeof req.id === 'string' && { requestId: req.id }),
    };
    res.status(problem.status).type(PROBLEM_CONTENT_TYPE).json(body);
  }
}

export function toProblem(exception: unknown): ProblemDetails {
  if (exception instanceof ValidationProblemException) {
    return {
      type: '/problems/validation-error',
      title: 'Validation error',
      status: HttpStatus.BAD_REQUEST,
      detail: 'One or more fields are invalid.',
      errors: exception.errors,
    };
  }

  if (exception instanceof DomainProblemException) {
    const status = exception.getStatus();
    return {
      ...exception.extensions,
      type: exception.problemType,
      title: STATUS_CODES[status] ?? 'Error',
      status,
      detail: exception.detail,
    };
  }

  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    const detail = extractDetail(exception.getResponse());
    return {
      type: 'about:blank',
      title: STATUS_CODES[status] ?? 'Error',
      status,
      ...(detail !== undefined && { detail }),
    };
  }

  const prismaProblem = fromPrismaError(exception);
  if (prismaProblem) return prismaProblem;

  // Nunca vaza detalhes internos de erros inesperados.
  return {
    type: 'about:blank',
    title: 'Internal Server Error',
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    detail: 'An unexpected error occurred.',
  };
}

/**
 * Erros conhecidos do Prisma viram respostas de negócio. Um registro de outra empresa nunca é
 * encontrado (a extensão de tenant filtra), então chega aqui como P2025 → 404, sem revelar que existe.
 */
function fromPrismaError(exception: unknown): ProblemDetails | undefined {
  if (!(exception instanceof Prisma.PrismaClientKnownRequestError)) return undefined;

  switch (exception.code) {
    case 'P2025':
      return {
        type: 'about:blank',
        title: 'Not Found',
        status: HttpStatus.NOT_FOUND,
        detail: 'Resource not found.',
      };
    case 'P2002':
      return {
        type: '/problems/conflict',
        title: 'Conflict',
        status: HttpStatus.CONFLICT,
        detail: 'A record with the same unique value already exists.',
        ...uniqueFields(exception.meta),
      };
    case 'P2003':
      return {
        type: '/problems/conflict',
        title: 'Conflict',
        status: HttpStatus.CONFLICT,
        detail: 'The operation conflicts with related records.',
      };
    default:
      return undefined;
  }
}

/** Campos em conflito, sem o `companyId` (detalhe interno do isolamento). */
function uniqueFields(meta: Record<string, unknown> | undefined): Pick<ProblemDetails, 'errors'> {
  const fields = conflictingFields(meta).filter((field) => field !== 'companyId');
  return fields.length
    ? { errors: fields.map((field) => ({ field, messages: ['must be unique'] })) }
    : {};
}

/**
 * Sem driver adapter o Prisma informa `meta.target`; com `@prisma/adapter-pg` informa só o nome da
 * constraint (`products_company_id_sku_key`), seguindo a convenção `<tabela>_<colunas>_key`.
 */
export function conflictingFields(meta: Record<string, unknown> | undefined): string[] {
  const target = meta?.['target'];
  if (Array.isArray(target)) {
    return target.filter((field): field is string => typeof field === 'string');
  }

  const cause = (meta?.['driverAdapterError'] as { cause?: Record<string, unknown> } | undefined)
    ?.cause;
  const table = cause?.['table'];
  const constraint = cause?.['constraint'] as { fields?: unknown; index?: unknown } | undefined;
  if (Array.isArray(constraint?.fields)) {
    return constraint.fields.filter((f): f is string => typeof f === 'string').map(camelCase);
  }
  if (typeof constraint?.index !== 'string' || typeof table !== 'string') return [];

  const columns = constraint.index
    .replace(new RegExp(`^${table}_`), '')
    .replace(/_key$/, '')
    .replace(/^company_id_/, '');
  return columns ? [camelCase(columns)] : [];
}

const camelCase = (column: string): string =>
  column.replace(/_([a-z0-9])/g, (_match, char: string) => char.toUpperCase());

function extractDetail(response: string | object): string | undefined {
  if (typeof response === 'string') return response;
  if ('message' in response) {
    const { message } = response;
    if (typeof message === 'string') return message;
    if (Array.isArray(message)) return message.join('; ');
  }
  return undefined;
}
