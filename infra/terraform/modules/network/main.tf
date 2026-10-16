# VPC com 2 subnets públicas + 2 privadas, SEM NAT Gateway (custo). Veja docs/adr/0010.
# - públicas: rota para o Internet Gateway (gratuito); o RDS fica aqui no modo padrão.
# - privadas: sem saída para a internet; S3 via gateway endpoint (gratuito) e, opcionalmente,
#   interface endpoints (pagos) para o modo private_networking.

data "aws_availability_zones" "available" {
  state = "available"
}

data "aws_region" "current" {}

locals {
  azs = slice(data.aws_availability_zones.available.names, 0, 2)
}

resource "aws_vpc" "this" {
  cidr_block           = var.cidr_block
  enable_dns_support   = true
  enable_dns_hostnames = true
  tags                 = merge(var.tags, { Name = var.name })
}

# Fecha o security group padrão (nenhuma regra): nada usa o default por acidente.
resource "aws_default_security_group" "this" {
  vpc_id = aws_vpc.this.id
  tags   = merge(var.tags, { Name = "${var.name}-default-closed" })
}

resource "aws_internet_gateway" "this" {
  vpc_id = aws_vpc.this.id
  tags   = merge(var.tags, { Name = var.name })
}

resource "aws_subnet" "public" {
  count             = length(local.azs)
  vpc_id            = aws_vpc.this.id
  availability_zone = local.azs[count.index]
  cidr_block        = cidrsubnet(var.cidr_block, 8, count.index)
  # IPs públicos só para recursos que pedirem explicitamente (ex.: RDS publicly_accessible).
  map_public_ip_on_launch = false
  tags                    = merge(var.tags, { Name = "${var.name}-public-${local.azs[count.index]}", Tier = "public" })
}

resource "aws_subnet" "private" {
  count             = length(local.azs)
  vpc_id            = aws_vpc.this.id
  availability_zone = local.azs[count.index]
  cidr_block        = cidrsubnet(var.cidr_block, 8, count.index + 10)
  tags              = merge(var.tags, { Name = "${var.name}-private-${local.azs[count.index]}", Tier = "private" })
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.this.id
  tags   = merge(var.tags, { Name = "${var.name}-public" })
}

resource "aws_route" "public_internet" {
  route_table_id         = aws_route_table.public.id
  destination_cidr_block = "0.0.0.0/0"
  gateway_id             = aws_internet_gateway.this.id
}

resource "aws_route_table_association" "public" {
  count          = length(aws_subnet.public)
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

# Sem rota default: subnets privadas não saem para a internet (não há NAT).
resource "aws_route_table" "private" {
  vpc_id = aws_vpc.this.id
  tags   = merge(var.tags, { Name = "${var.name}-private" })
}

resource "aws_route_table_association" "private" {
  count          = length(aws_subnet.private)
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private.id
}

# Gateway endpoint do S3: gratuito; tráfego da VPC para o S3 não passa pela internet.
resource "aws_vpc_endpoint" "s3" {
  vpc_id            = aws_vpc.this.id
  service_name      = "com.amazonaws.${data.aws_region.current.region}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = [aws_route_table.private.id, aws_route_table.public.id]
  tags              = merge(var.tags, { Name = "${var.name}-s3" })
}

# --- Security groups ----------------------------------------------------------------------------

resource "aws_security_group" "lambda" {
  name        = "${var.name}-lambda"
  description = "Lambda functions attached to the VPC (private_networking mode)"
  vpc_id      = aws_vpc.this.id
  tags        = merge(var.tags, { Name = "${var.name}-lambda" })
}

resource "aws_vpc_security_group_egress_rule" "lambda_to_db" {
  security_group_id            = aws_security_group.lambda.id
  description                  = "PostgreSQL"
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
  referenced_security_group_id = aws_security_group.database.id
}

resource "aws_vpc_security_group_egress_rule" "lambda_https" {
  security_group_id = aws_security_group.lambda.id
  description       = "HTTPS to VPC endpoints and the S3 gateway endpoint"
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
  cidr_ipv4         = "0.0.0.0/0"
}

resource "aws_security_group" "database" {
  name        = "${var.name}-database"
  description = "RDS PostgreSQL"
  vpc_id      = aws_vpc.this.id
  tags        = merge(var.tags, { Name = "${var.name}-database" })
}

resource "aws_vpc_security_group_ingress_rule" "db_from_lambda" {
  security_group_id            = aws_security_group.database.id
  description                  = "PostgreSQL from VPC Lambdas"
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
  referenced_security_group_id = aws_security_group.lambda.id
}

# Modo padrão (Lambdas fora da VPC): o RDS precisa aceitar conexões vindas da internet.
# A proteção passa a ser TLS obrigatório + senha forte (ADR 0010). Lista vazia = nenhuma regra.
resource "aws_vpc_security_group_ingress_rule" "db_public" {
  for_each          = toset(var.database_public_cidrs)
  security_group_id = aws_security_group.database.id
  description       = "PostgreSQL over TLS from Lambda outside the VPC (ADR 0010)"
  ip_protocol       = "tcp"
  from_port         = 5432
  to_port           = 5432
  cidr_ipv4         = each.value
}

# --- Interface endpoints (opcionais, ~US$ 7/mês cada por AZ) -----------------------------------

resource "aws_security_group" "endpoints" {
  count       = length(var.interface_endpoints) > 0 ? 1 : 0
  name        = "${var.name}-endpoints"
  description = "Interface VPC endpoints"
  vpc_id      = aws_vpc.this.id
  tags        = merge(var.tags, { Name = "${var.name}-endpoints" })
}

resource "aws_vpc_security_group_ingress_rule" "endpoints_from_lambda" {
  count                        = length(var.interface_endpoints) > 0 ? 1 : 0
  security_group_id            = aws_security_group.endpoints[0].id
  description                  = "HTTPS from VPC Lambdas"
  ip_protocol                  = "tcp"
  from_port                    = 443
  to_port                      = 443
  referenced_security_group_id = aws_security_group.lambda.id
}

resource "aws_vpc_endpoint" "interface" {
  for_each            = toset(var.interface_endpoints)
  vpc_id              = aws_vpc.this.id
  service_name        = "com.amazonaws.${data.aws_region.current.region}.${each.value}"
  vpc_endpoint_type   = "Interface"
  private_dns_enabled = true
  # Uma AZ só: metade do custo; se a AZ cair, a API cai junto (aceitável neste projeto).
  subnet_ids         = [aws_subnet.private[0].id]
  security_group_ids = [aws_security_group.endpoints[0].id]
  tags               = merge(var.tags, { Name = "${var.name}-${each.value}" })
}
