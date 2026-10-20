import { beforeEach, describe, expect, it, vi } from 'vitest';

const send = vi.fn();
const destroy = vi.fn();
vi.mock('@aws-sdk/client-ssm', () => ({
  SSMClient: class {
    send = send;
    destroy = destroy;
  },
  GetParametersCommand: class {
    constructor(readonly input: unknown) {}
  },
}));

/** O módulo guarda o resultado por ambiente de execução: cada teste importa uma cópia nova. */
async function load(env: NodeJS.ProcessEnv) {
  vi.resetModules();
  const { loadRuntimeSecrets } = await import('./runtime-secrets.js');
  return loadRuntimeSecrets(env);
}

describe('loadRuntimeSecrets', () => {
  beforeEach(() => {
    send.mockReset();
    destroy.mockReset();
  });

  it('does nothing locally (no *_SSM_PARAMETER variables)', async () => {
    const env = { DATABASE_URL: 'postgresql://local' };
    await load(env);
    expect(send).not.toHaveBeenCalled();
    expect(env.DATABASE_URL).toBe('postgresql://local');
  });

  it('fills the target variable with the decrypted parameter', async () => {
    send.mockResolvedValue({
      Parameters: [{ Name: '/traceflow/prod/db/url', Value: 'postgresql://secret' }],
    });
    const env: NodeJS.ProcessEnv = { DATABASE_URL_SSM_PARAMETER: '/traceflow/prod/db/url' };

    await load(env);

    expect(env['DATABASE_URL']).toBe('postgresql://secret');
    expect(send.mock.calls[0]?.[0]).toMatchObject({
      input: { Names: ['/traceflow/prod/db/url'], WithDecryption: true },
    });
    expect(destroy).toHaveBeenCalled();
  });

  it('keeps a variable that is already set', async () => {
    const env: NodeJS.ProcessEnv = {
      DATABASE_URL: 'postgresql://explicit',
      DATABASE_URL_SSM_PARAMETER: '/traceflow/prod/db/url',
    };
    await load(env);
    expect(send).not.toHaveBeenCalled();
    expect(env['DATABASE_URL']).toBe('postgresql://explicit');
  });

  it('fails on a missing parameter and lets the next invocation retry', async () => {
    vi.resetModules();
    const { loadRuntimeSecrets } = await import('./runtime-secrets.js');
    const env: NodeJS.ProcessEnv = { DATABASE_URL_SSM_PARAMETER: '/missing' };

    send.mockResolvedValueOnce({ InvalidParameters: ['/missing'], Parameters: [] });
    await expect(loadRuntimeSecrets(env)).rejects.toThrow('SSM parameters not found: /missing');

    send.mockResolvedValueOnce({ Parameters: [{ Name: '/missing', Value: 'ok' }] });
    await loadRuntimeSecrets(env);
    expect(env['DATABASE_URL']).toBe('ok');
  });
});
