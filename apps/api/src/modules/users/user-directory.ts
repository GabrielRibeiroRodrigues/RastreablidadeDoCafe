import {
  AdminAddUserToGroupCommand,
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  AdminDisableUserCommand,
  AdminEnableUserCommand,
  AdminRemoveUserFromGroupCommand,
  AdminUserGlobalSignOutCommand,
  CognitoIdentityProviderClient,
  UsernameExistsException,
} from '@aws-sdk/client-cognito-identity-provider';
import { Logger } from '@nestjs/common';
import { ROLES, type Role as AppRole } from '@traceflow/shared';
import { randomUUID } from 'node:crypto';
import { emailTaken } from './users.problems.js';

/**
 * Onde as contas de login vivem. O banco guarda empresa e perfil (fonte de verdade da autorização);
 * o diretório guarda a credencial. Duas implementações com o mesmo contrato:
 * - `MockUserDirectory` (AUTH_MODE=mock): só gera um `sub`, o emissor simulado faz o resto;
 * - `CognitoUserDirectory`: cria a conta no User Pool (convite por e-mail com senha temporária),
 *   mantém os grupos iguais ao perfil e desativa/reativa o login.
 */
export interface UserDirectory {
  readonly kind: 'MOCK' | 'COGNITO';
  /** Cria a conta e devolve o `sub`. */
  invite(email: string, name: string, role: AppRole): Promise<string>;
  setRole(sub: string, role: AppRole): Promise<void>;
  /** Bloqueia o login e encerra as sessões abertas. */
  disable(sub: string): Promise<void>;
  enable(sub: string): Promise<void>;
  /** Apaga a conta. Só para desfazer um convite cuja gravação no banco falhou. */
  remove(sub: string): Promise<void>;
}

export const USER_DIRECTORY = Symbol('USER_DIRECTORY');

export class MockUserDirectory implements UserDirectory {
  readonly kind = 'MOCK' as const;

  invite(): Promise<string> {
    return Promise.resolve(`mock-${randomUUID()}`);
  }
  setRole(): Promise<void> {
    return Promise.resolve();
  }
  disable(): Promise<void> {
    return Promise.resolve();
  }
  enable(): Promise<void> {
    return Promise.resolve();
  }
  remove(): Promise<void> {
    return Promise.resolve();
  }
}

export class CognitoUserDirectory implements UserDirectory {
  readonly kind = 'COGNITO' as const;
  private readonly logger = new Logger(CognitoUserDirectory.name);

  constructor(
    private readonly userPoolId: string,
    private readonly client: CognitoIdentityProviderClient = new CognitoIdentityProviderClient({}),
  ) {}

  async invite(email: string, name: string, role: AppRole): Promise<string> {
    let created = false;
    try {
      const out = await this.client.send(
        new AdminCreateUserCommand({
          UserPoolId: this.userPoolId,
          Username: email,
          // O Cognito envia o convite com senha temporária para este e-mail.
          DesiredDeliveryMediums: ['EMAIL'],
          UserAttributes: [
            { Name: 'email', Value: email },
            { Name: 'email_verified', Value: 'true' },
            { Name: 'name', Value: name },
          ],
        }),
      );
      created = true;
      const sub = out.User?.Attributes?.find((attribute) => attribute.Name === 'sub')?.Value;
      if (!sub) throw new Error('Cognito did not return the user sub');
      await this.addGroup(email, role);
      return sub;
    } catch (error) {
      if (error instanceof UsernameExistsException) {
        throw emailTaken();
      }
      // Conta criada sem grupo: apaga para o convite poder ser refeito (senão daria "e-mail em uso").
      if (created) await this.remove(email);
      throw error;
    }
  }

  async remove(username: string): Promise<void> {
    try {
      await this.client.send(
        new AdminDeleteUserCommand({ UserPoolId: this.userPoolId, Username: username }),
      );
    } catch (error) {
      // Não mascara o erro original do convite; a conta órfã fica registrada no log.
      this.logger.error({ err: error, username }, 'Could not remove the Cognito account');
    }
  }

  async setRole(sub: string, role: AppRole): Promise<void> {
    for (const other of ROLES.filter((candidate) => candidate !== role)) {
      await this.client.send(
        new AdminRemoveUserFromGroupCommand({
          UserPoolId: this.userPoolId,
          Username: sub,
          GroupName: other,
        }),
      );
    }
    await this.addGroup(sub, role);
  }

  async disable(sub: string): Promise<void> {
    await this.client.send(
      new AdminDisableUserCommand({ UserPoolId: this.userPoolId, Username: sub }),
    );
    try {
      await this.client.send(
        new AdminUserGlobalSignOutCommand({ UserPoolId: this.userPoolId, Username: sub }),
      );
    } catch (error) {
      // O login já está bloqueado e a API recusa usuário inativo: o sign-out é só reforço.
      this.logger.warn({ err: error, sub }, 'Global sign-out failed');
    }
  }

  async enable(sub: string): Promise<void> {
    await this.client.send(
      new AdminEnableUserCommand({ UserPoolId: this.userPoolId, Username: sub }),
    );
  }

  private async addGroup(username: string, role: AppRole): Promise<void> {
    await this.client.send(
      new AdminAddUserToGroupCommand({
        UserPoolId: this.userPoolId,
        Username: username,
        GroupName: role,
      }),
    );
  }
}
