import { inject } from 'vitest';

// Roda antes de cada arquivo de teste de integração: o ConfigModule lê process.env no boot.
process.env['DATABASE_URL'] = inject('databaseUrl');
// Todas as requisições dos testes vêm do mesmo IP: o rate limit global não pode interferir.
process.env['RATE_LIMIT_PER_MINUTE'] ??= '100000';
