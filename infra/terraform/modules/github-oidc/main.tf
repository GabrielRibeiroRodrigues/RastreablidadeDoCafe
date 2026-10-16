# Role assumida pelo GitHub Actions via OIDC (sem chaves de acesso de longa duração).
# Confiança restrita ao repositório: branch main, tags v* e o environment `production`
# (jobs com `environment:` recebem o sub `repo:<repo>:environment:<nome>`).

data "aws_partition" "current" {}
data "aws_caller_identity" "current" {}

locals {
  partition  = data.aws_partition.current.partition
  account_id = data.aws_caller_identity.current.account_id
  subjects = concat(
    ["repo:${var.repository}:ref:refs/heads/main", "repo:${var.repository}:ref:refs/tags/v*"],
    [for env in var.environments : "repo:${var.repository}:environment:${env}"],
  )
  provider_arn = var.create_provider ? aws_iam_openid_connect_provider.github[0].arn : "arn:${local.partition}:iam::${local.account_id}:oidc-provider/token.actions.githubusercontent.com"
}

# Só pode existir um provider por URL na conta: use create_provider = false se já houver.
resource "aws_iam_openid_connect_provider" "github" {
  count          = var.create_provider ? 1 : 0
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
  tags           = var.tags
}

data "aws_iam_policy_document" "trust" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [local.provider_arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values   = local.subjects
    }
  }
}

resource "aws_iam_role" "deploy" {
  name                 = var.role_name
  assume_role_policy   = data.aws_iam_policy_document.trust.json
  max_session_duration = 3600
  tags                 = var.tags
}

# O Terraform cria recursos de muitos serviços: PowerUserAccess cobre tudo menos IAM/Organizations.
resource "aws_iam_role_policy_attachment" "power_user" {
  role       = aws_iam_role.deploy.name
  policy_arn = "arn:${local.partition}:iam::aws:policy/PowerUserAccess"
}

# IAM só para recursos com o prefixo do projeto (roles das Lambdas, Step Functions, Scheduler).
data "aws_iam_policy_document" "iam" {
  statement {
    sid = "ManageProjectRoles"
    actions = [
      "iam:CreateRole", "iam:DeleteRole", "iam:GetRole", "iam:UpdateRole", "iam:TagRole",
      "iam:UntagRole", "iam:UpdateAssumeRolePolicy", "iam:PutRolePolicy", "iam:GetRolePolicy",
      "iam:DeleteRolePolicy", "iam:ListRolePolicies", "iam:ListAttachedRolePolicies",
      "iam:AttachRolePolicy", "iam:DetachRolePolicy", "iam:ListInstanceProfilesForRole",
      "iam:PassRole",
    ]
    resources = ["arn:${local.partition}:iam::${local.account_id}:role/${var.resource_prefix}*"]
  }

  statement {
    sid       = "ReadOidcProvider"
    actions   = ["iam:GetOpenIDConnectProvider", "iam:TagOpenIDConnectProvider"]
    resources = [local.provider_arn]
  }

  # A própria role casa com o prefixo: sem isto, o CI poderia se dar AdministratorAccess.
  # Mudanças nela (e no provider OIDC) só com credenciais de administrador, localmente.
  statement {
    sid    = "DenySelfEscalation"
    effect = "Deny"
    actions = [
      "iam:AttachRolePolicy", "iam:DetachRolePolicy", "iam:PutRolePolicy", "iam:DeleteRolePolicy",
      "iam:UpdateAssumeRolePolicy", "iam:DeleteRole", "iam:UpdateRole",
    ]
    resources = [aws_iam_role.deploy.arn]
  }

  statement {
    sid       = "ReadOwnRole"
    actions   = ["iam:GetRole", "iam:ListAttachedRolePolicies", "iam:ListRolePolicies", "iam:GetRolePolicy"]
    resources = [aws_iam_role.deploy.arn]
  }
}

resource "aws_iam_role_policy" "iam" {
  name   = "${var.role_name}-iam"
  role   = aws_iam_role.deploy.id
  policy = data.aws_iam_policy_document.iam.json
}
