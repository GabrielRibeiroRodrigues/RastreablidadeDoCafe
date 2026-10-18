import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.js';
import { InboxService } from './inbox.service.js';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';
import { InboxNotifier, LogNotifier, NOTIFIER, SnsNotifier, type Notifier } from './notifier.js';

/**
 * Avisos: sempre na central do app (`InboxService`) e, por fora, no SNS quando `SNS_TOPIC_ARN`
 * está definido (senão, no log).
 */
@Global()
@Module({
  controllers: [NotificationsController],
  providers: [
    InboxService,
    NotificationsService,
    {
      provide: NOTIFIER,
      inject: [ConfigService, InboxService],
      useFactory: (config: ConfigService<Env, true>, inbox: InboxService): Notifier => {
        const topicArn = config.get('SNS_TOPIC_ARN', { infer: true });
        if (!topicArn) {
          new Logger('NotificationsModule').warn(
            'SNS_TOPIC_ARN is not set: notifications go to log',
          );
        }
        return new InboxNotifier(inbox, topicArn ? new SnsNotifier(topicArn) : new LogNotifier());
      },
    },
  ],
  exports: [NOTIFIER, InboxService],
})
export class NotificationsModule {}
