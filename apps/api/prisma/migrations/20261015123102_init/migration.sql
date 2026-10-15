-- CreateEnum
CREATE TYPE "role" AS ENUM ('ADMIN', 'OPERATOR', 'AUDITOR');

-- CreateEnum
CREATE TYPE "product_type" AS ENUM ('GREEN', 'ROASTED', 'BLEND', 'PACKAGING');

-- CreateEnum
CREATE TYPE "unit" AS ENUM ('KG', 'BAG_60KG', 'UNIT');

-- CreateEnum
CREATE TYPE "roast_level" AS ENUM ('LIGHT', 'MEDIUM_LIGHT', 'MEDIUM', 'MEDIUM_DARK', 'DARK');

-- CreateEnum
CREATE TYPE "supplier_type" AS ENUM ('PRODUCER', 'FARM', 'COOPERATIVE', 'TRADER');

-- CreateEnum
CREATE TYPE "location_type" AS ENUM ('WAREHOUSE', 'SILO', 'ROASTERY', 'QUARANTINE', 'SHIPPING');

-- CreateTable
CREATE TABLE "companies" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "tax_id" VARCHAR(14) NOT NULL,
    "lot_prefix" VARCHAR(5) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "cognito_sub" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "role" NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "sku" VARCHAR(40) NOT NULL,
    "name" TEXT NOT NULL,
    "type" "product_type" NOT NULL,
    "unit" "unit" NOT NULL,
    "default_roast_level" "roast_level",
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "supplier_type" NOT NULL,
    "document" VARCHAR(14),
    "farm_name" TEXT,
    "region" TEXT,
    "city" TEXT,
    "state" CHAR(2),
    "altitude_meters" INTEGER,
    "varieties" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "email" TEXT,
    "phone" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "document" VARCHAR(14),
    "email" TEXT,
    "phone" TEXT,
    "city" TEXT,
    "state" CHAR(2),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "locations" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "code" VARCHAR(20) NOT NULL,
    "name" TEXT NOT NULL,
    "type" "location_type" NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "locations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "companies_tax_id_key" ON "companies"("tax_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_cognito_sub_key" ON "users"("cognito_sub");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_company_id_idx" ON "users"("company_id");

-- CreateIndex
CREATE INDEX "products_company_id_name_idx" ON "products"("company_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "products_company_id_sku_key" ON "products"("company_id", "sku");

-- CreateIndex
CREATE INDEX "suppliers_company_id_name_idx" ON "suppliers"("company_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_company_id_document_key" ON "suppliers"("company_id", "document");

-- CreateIndex
CREATE INDEX "customers_company_id_name_idx" ON "customers"("company_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "customers_company_id_document_key" ON "customers"("company_id", "document");

-- CreateIndex
CREATE UNIQUE INDEX "locations_company_id_code_key" ON "locations"("company_id", "code");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
