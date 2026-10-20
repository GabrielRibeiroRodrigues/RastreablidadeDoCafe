import { Logger } from '@nestjs/common';
import { PublishCommand, SNSClient } from '@aws-sdk/client-sns';

/** Aviso enviado para fora do sistema (e-mail/SMS via SNS na AWS; log localmente). */
export interface Notification {
  /** Tipo do evento, ex.: `recall.completed`, `recall.failed`, `lots.expiring`. */
  event: string;
  companyId: string;
  subject: string;
  /** Texto legível (o corpo do e-mail). */
  body: string;
  /** Dados estruturados para quem consome o tópico. */
  data?: Record<string, unknown>;
}

export interface Notifier {
  notify(notification: Notification): Promise<void>;
}

/** Token de injeção do `Notifier` (interface não existe em runtime). */
export const NOTIFIER = Symbol('NOTIFIER');

/** Padrão local: o aviso vira uma linha estruturada no log. */
export class LogNotifier implements Notifier {
  private readonly logger = new Logger('Notifier');

  notify(notification: Notification): Promise<void> {
    this.logger.log(
      { event: notification.event, companyId: notification.companyId, data: notification.data },
      `${notification.subject}\n${notification.body}`,
    );
    return Promise.resolve();
  }
}

/** Publica no tópico SNS (assinaturas por e-mail/SMS/fila ficam na infraestrutura). */
export class SnsNotifier implements Notifier {
  constructor(
    private readonly topicArn: string,
    private readonly client: SNSClient = new SNSClient({}),
  ) {}

  async notify(notification: Notification): Promise<void> {
    await this.client.send(
      new PublishCommand({
        TopicArn: this.topicArn,
        Subject: snsSubject(notification.subject),
        Message: notification.data
          ? `${notification.body}\n\n---\n${JSON.stringify(notification.data, null, 2)}`
          : notification.body,
        MessageAttributes: {
          event: { DataType: 'String', StringValue: notification.event },
          companyId: { DataType: 'String', StringValue: notification.companyId },
        },
      }),
    );
  }
}

/** O SNS exige assunto ASCII, sem quebras de linha e com menos de 100 caracteres. */
export function snsSubject(subject: string): string {
  const ascii = subject
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\x20-\x7e]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return (ascii || 'TraceFlow').slice(0, 99);
}

/**
 * Grava o aviso na central do app (por usuário) e repassa ao canal externo (SNS ou log).
 * Falha na central não impede o aviso externo, e vice-versa: os dois são independentes.
 */
export class InboxNotifier implements Notifier {
  private readonly logger = new Logger('InboxNotifier');

  constructor(
    private readonly inbox: { deliver(notification: Notification): Promise<number> },
    private readonly external: Notifier,
  ) {}

  async notify(notification: Notification): Promise<void> {
    try {
      await this.inbox.deliver(notification);
    } catch (error) {
      this.logger.error({ err: error, event: notification.event }, 'In-app notification failed');
    }
    await this.external.notify(notification);
  }
}
