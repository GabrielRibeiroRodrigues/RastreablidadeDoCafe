# Cognito User Pool: login por e-mail, MFA opcional (TOTP), cadastro só por convite (os usuários
# precisam ser vinculados a uma empresa no banco), grupos = perfis da API (ADR 0005).

data "aws_region" "current" {}

resource "aws_cognito_user_pool" "this" {
  name                     = var.name
  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]
  deletion_protection      = var.deletion_protection ? "ACTIVE" : "INACTIVE"
  user_pool_tier           = "ESSENTIALS"

  mfa_configuration = "OPTIONAL"
  software_token_mfa_configuration {
    enabled = true
  }

  admin_create_user_config {
    allow_admin_create_user_only = true
    invite_message_template {
      email_subject = "Seu acesso ao TraceFlow"
      email_message = "Olá! Seu usuário é {username} e a senha temporária é {####}. Ela expira em 7 dias."
      sms_message   = "TraceFlow: usuário {username}, senha temporária {####}"
    }
  }

  password_policy {
    minimum_length                   = 12
    require_lowercase                = true
    require_uppercase                = true
    require_numbers                  = true
    require_symbols                  = false
    temporary_password_validity_days = 7
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  username_configuration {
    case_sensitive = false
  }

  schema {
    name                = "email"
    attribute_data_type = "String"
    required            = true
    mutable             = true
    string_attribute_constraints {
      min_length = 5
      max_length = 254
    }
  }

  # E-mail padrão do Cognito (limite diário baixo, sem custo). Para produção real: SES.
  email_configuration {
    email_sending_account = "COGNITO_DEFAULT"
  }

  tags = var.tags

  lifecycle {
    # O schema de atributos não pode mudar depois de criado.
    ignore_changes = [schema]
  }
}

resource "aws_cognito_user_group" "this" {
  for_each     = var.groups
  name         = each.key
  description  = each.value
  user_pool_id = aws_cognito_user_pool.this.id
}

resource "aws_cognito_user_pool_domain" "this" {
  domain       = var.domain_prefix
  user_pool_id = aws_cognito_user_pool.this.id
  # Hosted UI clássico: não exige estilo de Managed Login configurado.
  managed_login_version = 1
}

# App client público (SPA): Authorization Code + PKCE, sem secret.
resource "aws_cognito_user_pool_client" "web" {
  name         = "${var.name}-web"
  user_pool_id = aws_cognito_user_pool.this.id

  generate_secret                      = false
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["openid", "email", "profile"]
  supported_identity_providers         = ["COGNITO"]
  callback_urls                        = var.callback_urls
  logout_urls                          = var.logout_urls

  explicit_auth_flows = ["ALLOW_REFRESH_TOKEN_AUTH", "ALLOW_USER_SRP_AUTH"]

  access_token_validity  = 60
  id_token_validity      = 60
  refresh_token_validity = 30
  token_validity_units {
    access_token  = "minutes"
    id_token      = "minutes"
    refresh_token = "days"
  }

  enable_token_revocation       = true
  prevent_user_existence_errors = "ENABLED"
}
