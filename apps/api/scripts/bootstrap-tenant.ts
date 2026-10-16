/**
 * Creates (or updates) a company and its first user, mapped to a Cognito `sub`. Idempotent:
 * the company is keyed by tax ID (CNPJ) and the user by `cognito_sub`, so it can be re-run.
 *
 * Usage (from apps/api):
 *   pnpm tenant:bootstrap --tax-id 12345678000195 --company "Torrefação Serra Azul" \
 *     --lot-prefix CAF --email ana@example.com --name "Ana Ribeiro" --sub <cognito sub> [--role ADMIN]
 *
 * Every flag can also come from the environment: TENANT_TAX_ID, TENANT_COMPANY, TENANT_LOT_PREFIX,
 * TENANT_ADMIN_EMAIL, TENANT_ADMIN_NAME, TENANT_ADMIN_SUB, TENANT_ADMIN_ROLE. Needs DATABASE_URL.
 * See docs/deploy.md ("Primeiro acesso").
 */
import { parseArgs } from 'node:util';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Role } from '../src/generated/prisma/client.js';

const { values } = parseArgs({
  options: {
    'tax-id': { type: 'string', default: process.env['TENANT_TAX_ID'] },
    company: { type: 'string', default: process.env['TENANT_COMPANY'] },
    'lot-prefix': { type: 'string', default: process.env['TENANT_LOT_PREFIX'] },
    email: { type: 'string', default: process.env['TENANT_ADMIN_EMAIL'] },
    name: { type: 'string', default: process.env['TENANT_ADMIN_NAME'] },
    sub: { type: 'string', default: process.env['TENANT_ADMIN_SUB'] },
    role: { type: 'string', default: process.env['TENANT_ADMIN_ROLE'] ?? 'ADMIN' },
  },
});

function fail(message: string): never {
  console.error(`error: ${message}`);
  process.exit(1);
}

function required(key: keyof typeof values): string {
  const value = values[key]?.trim();
  if (!value) fail(`--${key} is required`);
  return value;
}

const taxId = required('tax-id').replace(/\D/g, '');
const companyName = required('company');
const lotPrefix = required('lot-prefix').toUpperCase();
const email = required('email').toLowerCase();
const userName = required('name');
const cognitoSub = required('sub');
const roleInput = required('role').toUpperCase();

if (taxId.length !== 14) fail('--tax-id must have 14 digits (CNPJ)');
if (!/^[A-Z]{2,5}$/.test(lotPrefix)) fail('--lot-prefix must be 2–5 letters');
if (!/^[^@\s]+@[^@\s]+$/.test(email)) fail('--email is invalid');
if (!(roleInput in Role)) fail(`--role must be one of ${Object.keys(Role).join(', ')}`);
const role = Role[roleInput as keyof typeof Role];

const connectionString = process.env['DATABASE_URL'];
if (!connectionString) fail('DATABASE_URL is not set');

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
try {
  const company = await prisma.company.upsert({
    where: { taxId },
    create: { taxId, name: companyName, lotPrefix },
    update: { name: companyName },
  });

  const existing = await prisma.user.findUnique({ where: { cognitoSub } });
  if (existing && existing.companyId !== company.id) {
    fail(`user ${cognitoSub} already belongs to another company (${existing.companyId})`);
  }

  const user = await prisma.user.upsert({
    where: { cognitoSub },
    create: { companyId: company.id, cognitoSub, email, name: userName, role },
    update: { email, name: userName, role, isActive: true },
  });

  console.log(
    JSON.stringify(
      {
        company: { id: company.id, name: company.name, taxId },
        user: { id: user.id, email, role },
      },
      null,
      2,
    ),
  );
} finally {
  await prisma.$disconnect();
}
