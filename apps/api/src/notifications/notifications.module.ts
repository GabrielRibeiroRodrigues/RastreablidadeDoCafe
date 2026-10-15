import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';
import { LogNotifier, NOTIFIER, SnsNotifier, type Notifier } from './notifier.js';

/** `SnsNotifier` quando `SNS_TOPIC_ARN` está definido; senão, `LogNotifier`. */
@Global()
@Module({
  providers: [
    {
      provide: NOTIFIER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): Notifier => {
        const topicArn = config.get('SNS_TOPIC_ARN', { infer: true });
        if (topicArn) return new SnsNotifier(topicArn);
        new Logger('NotificationsModule').warn('SNS_TOPIC_ARN is not set: notifications go to log');
        return new LogNotifier();
      },
    },
  ],
  exports: [NOTIFIER],
})
export class NotificationsModule {}
