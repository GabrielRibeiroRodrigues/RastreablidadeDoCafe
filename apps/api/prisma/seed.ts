/**
 * Seed de desenvolvimento: duas empresas de café com usuários e cadastros.
 * Idempotente (upsert por chaves únicas): pode rodar quantas vezes quiser.
 *
 * Uso: pnpm --filter @traceflow/api db:seed
 */
import { PrismaPg } from '@prisma/adapter-pg';
import {
  LocationType,
  PrismaClient,
  ProductType,
  RoastLevel,
  Role,
  SupplierType,
  Unit,
} from '../src/generated/prisma/client.js';

interface SeedCompany {
  taxId: string;
  name: string;
  lotPrefix: string;
  users: Array<{ cognitoSub: string; email: string; name: string; role: Role }>;
  products: Array<{
    sku: string;
    name: string;
    type: ProductType;
    unit: Unit;
    defaultRoastLevel?: RoastLevel;
    description?: string;
  }>;
  suppliers: Array<{
    document: string;
    name: string;
    type: SupplierType;
    farmName?: string;
    region: string;
    city: string;
    state: string;
    altitudeMeters: number;
    varieties: string[];
  }>;
  customers: Array<{ document: string; name: string; email?: string; city: string; state: string }>;
  locations: Array<{ code: string; name: string; type: LocationType }>;
}

/** Torrefação de cafés especiais — empresa principal para demonstração. */
const serraAzul: SeedCompany = {
  taxId: '12345678000195',
  name: 'Torrefação Serra Azul',
  lotPrefix: 'CAF',
  users: [
    {
      cognitoSub: 'dev-ana-admin',
      email: 'ana@serraazul.dev',
      name: 'Ana Ribeiro',
      role: Role.ADMIN,
    },
    {
      cognitoSub: 'dev-bruno-operator',
      email: 'bruno@serraazul.dev',
      name: 'Bruno Costa',
      role: Role.OPERATOR,
    },
    {
      cognitoSub: 'dev-carla-auditor',
      email: 'carla@serraazul.dev',
      name: 'Carla Mendes',
      role: Role.AUDITOR,
    },
  ],
  products: [
    {
      sku: 'VRD-BOURBON-AM',
      name: 'Café verde Bourbon Amarelo',
      type: ProductType.GREEN,
      unit: Unit.BAG_60KG,
    },
    {
      sku: 'VRD-CATUAI-VM',
      name: 'Café verde Catuaí Vermelho',
      type: ProductType.GREEN,
      unit: Unit.BAG_60KG,
    },
    {
      sku: 'VRD-MUNDO-NOVO',
      name: 'Café verde Mundo Novo',
      type: ProductType.GREEN,
      unit: Unit.BAG_60KG,
    },
    {
      sku: 'TOR-ESPECIAL',
      name: 'Serra Azul Especial (torrado)',
      type: ProductType.ROASTED,
      unit: Unit.KG,
      defaultRoastLevel: RoastLevel.MEDIUM_LIGHT,
      description: 'Notas de caramelo e frutas amarelas',
    },
    {
      sku: 'TOR-TRADICIONAL',
      name: 'Serra Azul Tradicional (torrado)',
      type: ProductType.ROASTED,
      unit: Unit.KG,
      defaultRoastLevel: RoastLevel.MEDIUM_DARK,
    },
    {
      sku: 'BLD-CASA',
      name: 'Blend da Casa',
      type: ProductType.BLEND,
      unit: Unit.KG,
      defaultRoastLevel: RoastLevel.MEDIUM,
      description: 'Bourbon Amarelo + Mundo Novo',
    },
    {
      sku: 'EMB-500G-VALV',
      name: 'Embalagem 500 g com válvula',
      type: ProductType.PACKAGING,
      unit: Unit.UNIT,
    },
  ],
  suppliers: [
    {
      document: '11122233396',
      name: 'José Aparecido da Silva',
      type: SupplierType.PRODUCER,
      farmName: 'Sítio Santa Inês',
      region: 'Mantiqueira de Minas',
      city: 'Carmo de Minas',
      state: 'MG',
      altitudeMeters: 1250,
      varieties: ['Bourbon Amarelo', 'Catuaí Vermelho'],
    },
    {
      document: '22333444000181',
      name: 'Fazenda Pedra Grande Ltda.',
      type: SupplierType.FARM,
      farmName: 'Fazenda Pedra Grande',
      region: 'Cerrado Mineiro',
      city: 'Patrocínio',
      state: 'MG',
      altitudeMeters: 1100,
      varieties: ['Mundo Novo', 'Catuaí Amarelo'],
    },
    {
      document: '33444555000181',
      name: 'Cooperativa Alta Mogiana',
      type: SupplierType.COOPERATIVE,
      region: 'Alta Mogiana',
      city: 'Franca',
      state: 'SP',
      altitudeMeters: 1000,
      varieties: ['Mundo Novo', 'Catuaí Vermelho', 'Bourbon Vermelho'],
    },
  ],
  customers: [
    {
      document: '44555666000181',
      name: 'Cafeteria Grão Fino',
      email: 'compras@graofino.dev',
      city: 'São Paulo',
      state: 'SP',
    },
    {
      document: '55666777000181',
      name: 'Empório Mineiro',
      email: 'pedidos@emporiomineiro.dev',
      city: 'Belo Horizonte',
      state: 'MG',
    },
    {
      document: '66777888000181',
      name: 'Padaria Pão & Prosa',
      city: 'Campinas',
      state: 'SP',
    },
  ],
  locations: [
    { code: 'ARM-01', name: 'Armazém de café verde', type: LocationType.WAREHOUSE },
    { code: 'SILO-01', name: 'Silo 1', type: LocationType.SILO },
    { code: 'TORRA', name: 'Torrefação', type: LocationType.ROASTERY },
    { code: 'QUAR', name: 'Área de quarentena', type: LocationType.QUARANTINE },
    { code: 'EXP', name: 'Expedição', type: LocationType.SHIPPING },
  ],
};

/** Segunda empresa: existe para demonstrar (e testar) o isolamento entre empresas. */
const valeDoCafe: SeedCompany = {
  taxId: '98765432000198',
  name: 'Cooperativa Vale do Café',
  lotPrefix: 'VDC',
  users: [
    {
      cognitoSub: 'dev-diego-admin',
      email: 'diego@valedocafe.dev',
      name: 'Diego Almeida',
      role: Role.ADMIN,
    },
    {
      cognitoSub: 'dev-elisa-operator',
      email: 'elisa@valedocafe.dev',
      name: 'Elisa Santos',
      role: Role.OPERATOR,
    },
  ],
  products: [
    {
      sku: 'VRD-ARARA',
      name: 'Café verde Arara',
      type: ProductType.GREEN,
      unit: Unit.BAG_60KG,
    },
  ],
  suppliers: [
    {
      document: '77788899941',
      name: 'Maria Helena Ferreira',
      type: SupplierType.PRODUCER,
      farmName: 'Sítio Boa Vista',
      region: 'Sul de Minas',
      city: 'Três Pontas',
      state: 'MG',
      altitudeMeters: 950,
      varieties: ['Arara', 'Catuaí Amarelo'],
    },
  ],
  customers: [
    {
      document: '88777666000100',
      name: 'Exportadora Porto Seguro',
      city: 'Santos',
      state: 'SP',
    },
  ],
  locations: [{ code: 'ARM-A', name: 'Armazém central', type: LocationType.WAREHOUSE }],
};

async function seedCompany(prisma: PrismaClient, data: SeedCompany): Promise<void> {
  const company = await prisma.company.upsert({
    where: { taxId: data.taxId },
    update: { name: data.name, lotPrefix: data.lotPrefix },
    create: { taxId: data.taxId, name: data.name, lotPrefix: data.lotPrefix },
  });
  const companyId = company.id;

  for (const user of data.users) {
    await prisma.user.upsert({
      where: { cognitoSub: user.cognitoSub },
      update: { email: user.email, name: user.name, role: user.role, companyId },
      create: { ...user, companyId },
    });
  }
  for (const product of data.products) {
    await prisma.product.upsert({
      where: { companyId_sku: { companyId, sku: product.sku } },
      update: product,
      create: { ...product, companyId },
    });
  }
  for (const supplier of data.suppliers) {
    await prisma.supplier.upsert({
      where: { companyId_document: { companyId, document: supplier.document } },
      update: supplier,
      create: { ...supplier, companyId },
    });
  }
  for (const customer of data.customers) {
    await prisma.customer.upsert({
      where: { companyId_document: { companyId, document: customer.document } },
      update: customer,
      create: { ...customer, companyId },
    });
  }
  for (const location of data.locations) {
    await prisma.location.upsert({
      where: { companyId_code: { companyId, code: location.code } },
      update: location,
      create: { ...location, companyId },
    });
  }

  console.log(
    `✔ ${data.name}: ${data.users.length} usuários, ${data.products.length} produtos, ` +
      `${data.suppliers.length} fornecedores, ${data.customers.length} clientes, ` +
      `${data.locations.length} locais`,
  );
}

const connectionString = process.env['DATABASE_URL'];
if (!connectionString) {
  throw new Error('DATABASE_URL is not set');
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
try {
  await seedCompany(prisma, serraAzul);
  await seedCompany(prisma, valeDoCafe);
} finally {
  await prisma.$disconnect();
}
