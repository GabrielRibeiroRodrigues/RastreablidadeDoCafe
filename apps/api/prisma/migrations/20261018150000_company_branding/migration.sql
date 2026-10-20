-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "brand_color" VARCHAR(7),
ADD COLUMN     "tagline" VARCHAR(140),
ADD COLUMN     "website" VARCHAR(200);


-- Cor no formato #RRGGBB (o front e o PDF calculam o contraste do texto).
ALTER TABLE "companies" ADD CONSTRAINT "companies_brand_color_hex" CHECK ("brand_color" ~ '^#[0-9a-fA-F]{6}$');
