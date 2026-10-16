import { GetParametersCommand, SSMClient } from '@aws-sdk/client-ssm';

const SUFFIX = '_SSM_PARAMETER';

let loaded: Promise<void> | undefined;

/**
 * Resolve segredos do SSM Parameter Store para variáveis de ambiente, uma vez por ambiente de
 * execução da Lambda. Convenção: `FOO_SSM_PARAMETER=/caminho` preenche `FOO` com o valor
 * (SecureString descriptografado), a menos que `FOO` já esteja definida. Assim o segredo não fica
 * em texto claro na configuração da função. Sem variáveis `*_SSM_PARAMETER`, não faz nada (local).
 */
export function loadRuntimeSecrets(env: NodeJS.ProcessEnv = process.env): Promise<void> {
  loaded ??= resolveSecrets(env).catch((error: unknown) => {
    loaded = undefined;
    throw error;
  });
  return loaded;
}

async function resolveSecrets(env: NodeJS.ProcessEnv): Promise<void> {
  const wanted = new Map<string, string>();
  for (const [key, value] of Object.entries(env)) {
    if (key.endsWith(SUFFIX) && value) {
      const target = key.slice(0, -SUFFIX.length);
      if (!env[target]) wanted.set(value, target);
    }
  }
  if (wanted.size === 0) return;

  const client = new SSMClient({});
  try {
    // GetParameters aceita até 10 nomes por chamada; aqui são 1–2.
    const names = [...wanted.keys()];
    for (let i = 0; i < names.length; i += 10) {
      const out = await client.send(
        new GetParametersCommand({ Names: names.slice(i, i + 10), WithDecryption: true }),
      );
      if (out.InvalidParameters?.length) {
        throw new Error(`SSM parameters not found: ${out.InvalidParameters.join(', ')}`);
      }
      for (const parameter of out.Parameters ?? []) {
        const target = parameter.Name ? wanted.get(parameter.Name) : undefined;
        if (target && parameter.Value !== undefined) env[target] = parameter.Value;
      }
    }
  } finally {
    client.destroy();
  }
}
