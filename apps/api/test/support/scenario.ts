import { randomUUID } from 'node:crypto';
import {
  LocationType,
  ProductType,
  Role,
  Unit,
  type Company,
} from '../../src/generated/prisma/client.js';
import { factories } from './factories.js';
import type { TestApp } from './test-app.js';

const bearer = { type: 'bearer' } as const;

/** Resposta de erro (RFC 9457) e campos que os testes leem. */
export interface Problem {
  type: string;
  status: number;
  code?: string;
  [key: string]: unknown;
}

/**
 * Empresa completa para testes de regra de negócio pela API: usuários dos três perfis, produtos,
 * locais, fornecedor, cliente e atalhos HTTP autenticados.
 */
export async function createScenario(testApp: TestApp, name = 'Torrefação Teste') {
  const make = factories(testApp.prisma);
  const company: Company = await make.company({
    name,
    lotPrefix: name.slice(0, 3).toUpperCase(),
  });

  const [admin, operator, auditor] = await Promise.all([
    make.user(company.id, { role: Role.ADMIN }),
    make.user(company.id, { role: Role.OPERATOR }),
    make.user(company.id, { role: Role.AUDITOR }),
  ]);
  const [green, roasted, blend] = await Promise.all([
    make.product(company.id, { type: ProductType.GREEN, unit: Unit.KG }),
    make.product(company.id, { type: ProductType.ROASTED, unit: Unit.KG }),
    make.product(company.id, { type: ProductType.BLEND, unit: Unit.KG }),
  ]);
  const [warehouse, roastery, quarantine] = await Promise.all([
    make.location(company.id, { type: LocationType.WAREHOUSE }),
    make.location(company.id, { type: LocationType.ROASTERY }),
    make.location(company.id, { type: LocationType.QUARANTINE }),
  ]);
  const supplier = await make.supplier(company.id, { farmName: 'Fazenda Teste' });
  const customer = await make.customer(company.id, { email: 'compras@cliente.dev' });

  const tokenFor = async (email: string) => {
    const res = await testApp.http().post('/v1/dev/token').send({ email }).expect(200);
    return (res.body as { accessToken: string }).accessToken;
  };
  const tokens = {
    admin: await tokenFor(admin.email),
    operator: await tokenFor(operator.email),
    auditor: await tokenFor(auditor.email),
  };
  type As = keyof typeof tokens;

  const http = {
    get: (path: string, as: As = 'admin') => testApp.http().get(path).auth(tokens[as], bearer),
    post: (path: string, body: object = {}, as: As = 'admin', idempotencyKey?: string) => {
      const req = testApp.http().post(path).auth(tokens[as], bearer).send(body);
      return idempotencyKey ? req.set('Idempotency-Key', idempotencyKey) : req;
    },
    patch: (path: string, body: object, as: As = 'admin') =>
      testApp.http().patch(path).auth(tokens[as], bearer).send(body),
  };

  /** Recebe um lote de café verde e devolve o id. */
  const receive = async (quantity = '100', locationId = warehouse.id): Promise<string> => {
    const res = await http.post('/v1/receipts', {
      productId: green.id,
      supplierId: supplier.id,
      locationId,
      quantity,
      harvest: '2025/26',
      variety: 'Catuaí',
    });
    if (res.status !== 201) throw new Error(`receipt failed: ${res.status} ${res.text}`);
    return (res.body as { id: string }).id;
  };

  /** Ordem de produção simples (1 insumo → 1 saída) e devolve o id do lote gerado. */
  const produce = async (
    inputs: Array<{ lotId: string; locationId: string; quantity: string }>,
    outputQuantity: string,
    stage: 'ROASTING' | 'BLENDING' = 'ROASTING',
  ): Promise<string> => {
    const res = await http.post('/v1/production-orders', {
      stage,
      inputs,
      outputProductId: stage === 'ROASTING' ? roasted.id : blend.id,
      outputLocationId: roastery.id,
      outputQuantity,
    });
    if (res.status !== 201) throw new Error(`production failed: ${res.status} ${res.text}`);
    return (res.body as { output: { id: string } }).output.id;
  };

  const ship = async (lotId: string, quantity: string, locationId = roastery.id) => {
    const res = await http.post('/v1/shipments', {
      customerId: customer.id,
      items: [{ lotId, locationId, quantity }],
    });
    if (res.status !== 201) throw new Error(`shipment failed: ${res.status} ${res.text}`);
    return res.body as { id: string; number: string };
  };

  const lot = async (id: string) =>
    (await http.get(`/v1/lots/${id}`).expect(200)).body as {
      id: string;
      code: string;
      status: string;
      balance: string;
    };

  return {
    company,
    users: { admin, operator, auditor },
    products: { green, roasted, blend },
    locations: { warehouse, roastery, quarantine },
    supplier,
    customer,
    tokens,
    http,
    receive,
    produce,
    ship,
    lot,
  };
}

export type Scenario = Awaited<ReturnType<typeof createScenario>>;

/** Chave de idempotência válida e única. */
export const newKey = (): string => `test-${randomUUID()}`;
