import { inject } from 'vitest';

// Roda antes de cada arquivo de teste de integração: o ConfigModule lê process.env no boot.
process.env['DATABASE_URL'] = inject('databaseUrl');
