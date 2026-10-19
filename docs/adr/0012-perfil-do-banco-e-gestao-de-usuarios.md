# 0012 — Perfil do banco como fonte de verdade e gestão de usuários pela API

- **Status:** Aceito (2026-10-18). Altera parte do [ADR 0005](0005-auth-cognito-mock-issuer.md).

## Contexto

Até aqui os perfis vinham do token (`cognito:groups`), e criar um usuário exigia o console da AWS mais o script `tenant:bootstrap`. Isso tem dois problemas:

1. **Cada novo funcionário dependia de quem tem acesso à AWS.** Um sistema de empresa precisa que o próprio admin convide, mude o perfil e bloqueie acessos.
2. **Revogar não era imediato.** Rebaixar um admin ou remover alguém de um grupo só valia quando o access token expirasse (até 1 h). Desativar já era imediato, porque a API checa `users.is_active` a cada requisição.

## Decisão

- **O perfil da tabela `users` é a fonte de verdade da autorização.** O `JwtStrategy` já carrega o usuário pelo `sub` a cada requisição. Agora usa `users.role`, e não os grupos do token. O token continua provando **quem** é a pessoa (assinatura, emissor, expiração, `client_id`), e o banco diz **o que ela pode fazer**.
- **Os grupos do Cognito são mantidos iguais ao banco** pela gestão de usuários. Assim o console da AWS continua coerente e uma volta ao modelo anterior fica possível.
- **Gestão de usuários pela API** (`/v1/users`, só admin): convidar, editar nome e perfil, desativar e reativar. Por trás fica uma interface `UserDirectory` com duas implementações:
  - `MockUserDirectory`, para desenvolvimento e testes: só gera um `sub`.
  - `CognitoUserDirectory`: `AdminCreateUser` (convite por e-mail com senha temporária), troca de grupos, `AdminDisableUser`/`AdminEnableUser` e `AdminUserGlobalSignOut`.
- A chamada ao Cognito acontece **dentro** da transação do banco. Se o Cognito falhar, nada muda no banco. No sentido inverso (o Cognito criou a conta e o banco recusou, por exemplo e-mail repetido, ou o grupo não pôde ser adicionado), o convite **apaga a conta** com `AdminDeleteUser`, para não deixar no User Pool um login que a API recusa e que bloquearia um novo convite (adendo de 2026-10-19).
- Regras de negócio:
  - o admin não muda o próprio perfil nem desativa a própria conta;
  - a empresa nunca fica sem um admin ativo. Os admins da empresa são travados com `FOR UPDATE`, então dois admins rebaixando um ao outro ao mesmo tempo não zeram a lista.
- O e-mail de login é único entre todas as empresas, porque é o `username` do User Pool.

## Consequências

- Rebaixar, promover ou desativar vale **na próxima requisição**, sem esperar o token expirar.
- Um token forjado ou desatualizado com grupos "promovidos" não dá permissão nenhuma.
- A Lambda da API ganha permissões `cognito-idp:Admin*`, restritas ao User Pool do projeto.
- O `tenant:bootstrap` continua necessário só para criar a empresa e o **primeiro** admin. Os demais usuários são convidados pela tela **Gestão → Usuários**.
