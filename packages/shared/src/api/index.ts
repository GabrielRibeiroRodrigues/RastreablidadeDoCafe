/**
 * Tipos do contrato HTTP gerados do OpenAPI da API (não editar `schema.ts` à mão).
 * Regenerar: `pnpm openapi` na raiz.
 */
export type { components, operations, paths } from './schema.js';

import type { components } from './schema.js';

type Schemas = components['schemas'];

/** Atalho: `ApiSchema<'ProductResponse'>`. */
export type ApiSchema<Name extends keyof Schemas> = Schemas[Name];
