import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.js';
import { CognitoUserDirectory, MockUserDirectory, USER_DIRECTORY } from './user-directory.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

@Module({
  controllers: [UsersController],
  providers: [
    UsersService,
    {
      // Cognito em produção; no modo simulado só o banco muda.
      provide: USER_DIRECTORY,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => {
        if (config.get('AUTH_MODE', { infer: true }) === 'cognito') {
          return new CognitoUserDirectory(config.get('COGNITO_USER_POOL_ID', { infer: true }));
        }
        new Logger('UsersModule').log('User directory: mock (AUTH_MODE=mock)');
        return new MockUserDirectory();
      },
    },
  ],
})
export class UsersModule {}
