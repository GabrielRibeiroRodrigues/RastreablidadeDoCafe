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

  // Nunca vaza detalhes internos de erros inesperados.
  return {
    type: 'about:blank',
    title: 'Internal Server Error',
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    detail: 'An unexpected error occurred.',
  };
}

function extractDetail(response: string | object): string | undefined {
  if (typeof response === 'string') return response;
  if ('message' in response) {
    const { message } = response;
    if (typeof message === 'string') return message;
    if (Array.isArray(message)) return message.join('; ');
  }
  return undefined;
}
