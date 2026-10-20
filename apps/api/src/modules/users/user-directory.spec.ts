import type { CognitoIdentityProviderClient } from '@aws-sdk/client-cognito-identity-provider';
import { UsernameExistsException } from '@aws-sdk/client-cognito-identity-provider';
import { describe, expect, it, vi } from 'vitest';
import { DomainProblemException } from '../../common/http/domain-problem.exception.js';
import { CognitoUserDirectory } from './user-directory.js';

/** Cliente falso: registra os comandos e responde o que o teste mandar. */
function fakeClient(reply: (name: string) => unknown = () => ({})) {
  const calls: Array<{ name: string; input: Record<string, unknown> }> = [];
  const send = vi.fn(
    (command: { constructor: { name: string }; input: Record<string, unknown> }) => {
      calls.push({ name: command.constructor.name, input: command.input });
      const out = reply(command.constructor.name);
      return out instanceof Error ? Promise.reject(out) : Promise.resolve(out);
    },
  );
  return { client: { send } as unknown as CognitoIdentityProviderClient, calls };
}

describe('CognitoUserDirectory', () => {
  it('invites by e-mail, returns the sub and adds the role group', async () => {
    const { client, calls } = fakeClient((name) =>
      name === 'AdminCreateUserCommand'
        ? { User: { Attributes: [{ Name: 'sub', Value: 'sub-123' }] } }
        : {},
    );
    const directory = new CognitoUserDirectory('pool-1', client);

    await expect(directory.invite('ana@x.dev', 'Ana', 'operator')).resolves.toBe('sub-123');
    expect(calls.map((c) => c.name)).toEqual([
      'AdminCreateUserCommand',
      'AdminAddUserToGroupCommand',
    ]);
    expect(calls[0]!.input).toMatchObject({
      UserPoolId: 'pool-1',
      Username: 'ana@x.dev',
      DesiredDeliveryMediums: ['EMAIL'],
    });
    expect(calls[1]!.input).toMatchObject({ GroupName: 'operator' });
  });

  it('maps an existing Cognito username to the e-mail conflict problem', async () => {
    const { client } = fakeClient(
      () => new UsernameExistsException({ message: 'exists', $metadata: {} }),
    );
    const directory = new CognitoUserDirectory('pool-1', client);

    const error = await directory.invite('ana@x.dev', 'Ana', 'admin').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DomainProblemException);
    expect((error as DomainProblemException).extensions).toMatchObject({
      errors: [{ field: 'email' }],
    });
  });

  it('deletes the new account when adding the role group fails, so the invite can be retried', async () => {
    const { client, calls } = fakeClient((name) => {
      if (name === 'AdminCreateUserCommand') {
        return { User: { Attributes: [{ Name: 'sub', Value: 'sub-123' }] } };
      }
      return name === 'AdminAddUserToGroupCommand' ? new Error('throttled') : {};
    });
    const directory = new CognitoUserDirectory('pool-1', client);

    await expect(directory.invite('ana@x.dev', 'Ana', 'admin')).rejects.toThrow('throttled');
    expect(calls.map((c) => c.name)).toEqual([
      'AdminCreateUserCommand',
      'AdminAddUserToGroupCommand',
      'AdminDeleteUserCommand',
    ]);
    expect(calls[2]!.input).toMatchObject({ Username: 'ana@x.dev' });
  });

  it('keeps exactly the role group when the role changes', async () => {
    const { client, calls } = fakeClient();
    await new CognitoUserDirectory('pool-1', client).setRole('sub-1', 'auditor');

    expect(calls.map((c) => [c.name, c.input['GroupName']])).toEqual([
      ['AdminRemoveUserFromGroupCommand', 'admin'],
      ['AdminRemoveUserFromGroupCommand', 'operator'],
      ['AdminAddUserToGroupCommand', 'auditor'],
    ]);
  });

  it('disables the login and signs out; a failed sign-out does not fail the operation', async () => {
    const { client, calls } = fakeClient((name) =>
      name === 'AdminUserGlobalSignOutCommand' ? new Error('throttled') : {},
    );
    await expect(
      new CognitoUserDirectory('pool-1', client).disable('sub-1'),
    ).resolves.toBeUndefined();
    expect(calls.map((c) => c.name)).toEqual([
      'AdminDisableUserCommand',
      'AdminUserGlobalSignOutCommand',
    ]);
  });
});
