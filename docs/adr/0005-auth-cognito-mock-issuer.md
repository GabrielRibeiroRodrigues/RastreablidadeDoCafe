# 0005 — Autenticação com Cognito e emissor simulado em desenvolvimento

- **Status:** Aceito (2026-10-15)

## Contexto

Produção usa Amazon Cognito. Localmente (e na CI) não queremos depender da AWS, mas também não queremos um "bypass" de autenticação que siga um caminho de código diferente.

## Decisão

- A API valida JWT RS256 com `passport-jwt` + `jwks-rsa`, checando emissor, audiência/`client_id` e expiração.
- Perfis vêm do claim `cognito:groups` (`admin`, `operator`, `auditor`); a empresa vem da tabela `users`.
- Com `AUTH_MODE=mock`, um módulo de desenvolvimento gera um par de chaves, expõe sua própria JWKS e `POST /dev/token`, emitindo tokens **com o mesmo formato** do Cognito. A validação é exatamente a mesma estratégia.
- O módulo mock só é registrado fora de produção, e a aplicação **falha ao iniciar** se `NODE_ENV=production` e `AUTH_MODE=mock`.
- Front: login pelo Hosted UI/Managed Login do Cognito com PKCE via `oidc-client-ts`; em modo mock, uma tela de seleção de usuário de desenvolvimento.

## Consequências

- Testes de integração exercitam o caminho real de validação de JWT.
- Login com Cognito real só é testado quando o User Pool for criado (Semana 6 ou antes, com autorização).
