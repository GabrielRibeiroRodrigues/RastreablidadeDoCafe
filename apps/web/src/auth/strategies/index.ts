import type { AppEnv } from '@/config/env';
import type { AuthStrategy } from '../types';
import { createCognitoStrategy } from './cognito';
import { createMockStrategy } from './mock';

export function createAuthStrategy(env: AppEnv): AuthStrategy {
  return env.authMode === 'cognito' ? createCognitoStrategy(env.cognito) : createMockStrategy();
}
