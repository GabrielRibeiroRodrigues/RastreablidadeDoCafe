import { HttpStatus } from '@nestjs/common';
import { DomainProblemException } from '../../common/http/domain-problem.exception.js';

/** Mesmo formato do conflito de chave única: o front mostra o erro no campo. */
export const emailTaken = () =>
  new DomainProblemException(
    '/problems/conflict',
    'This e-mail is already registered.',
    HttpStatus.CONFLICT,
    { errors: [{ field: 'email', messages: ['must be unique'] }] },
  );
