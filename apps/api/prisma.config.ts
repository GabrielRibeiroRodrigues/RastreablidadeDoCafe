import { defineConfig } from 'prisma/config';

// O CLI do Prisma 7 não carrega .env sozinho; o Node 24 faz isso sem dependências.
try {
  process.loadEnvFile();
} catch {
  // Sem .env (CI, contêiner): as variáveis vêm do ambiente.
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env['DATABASE_URL'],
  },
});
