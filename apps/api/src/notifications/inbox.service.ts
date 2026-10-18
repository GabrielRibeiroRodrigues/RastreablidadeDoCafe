import { Injectable, Logger } from '@nestjs/common';
import { Role, type Prisma } from '../generated/prisma/client.js';
import { TenantPrismaService } from '../tenancy/tenant-prisma.service.js';
import type { Notification } from './notifier.js';

/** Categorias que o usuário pode silenciar na central de avisos. */
export const NOTIFICATION_CATEGORIES = ['recall', 'expiry', 'quality'] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

/** Quem recebe cada categoria (o recall interessa a todos, inclusive ao auditor). */
const RECIPIENT_ROLES: Record<NotificationCategory, Role[]> = {
  recall: [Role.ADMIN, Role.OPERATOR, Role.AUDITOR],
  expiry: [Role.ADMIN, Role.OPERATOR],
  quality: [Role.ADMIN, Role.OPERATOR],
};

export function categoryOf(event: string): NotificationCategory | undefined {
  if (event.startsWith('recall.')) return 'recall';
  if (event.startsWith('lots.expiring')) return 'expiry';
  if (event.startsWith('non_conformity.')) return 'quality';
  return undefined;
}

const text = (value: unknown): string | undefined =>
  typeof value === 'string' && value ? value : undefined;

/** Rota do front que abre o assunto do aviso. */
export function linkOf(notification: Notification): string | null {
  const data = notification.data ?? {};
  const recallId = text(data['recallId']);
  if (recallId) return `/recall/${recallId}`;
  const ncId = text(data['nonConformityId']);
  if (ncId) return `/qualidade/${ncId}`;
  if (notification.event === 'lots.expiring') {
    const days = typeof data['days'] === 'number' ? data['days'] : 30;
    return `/lotes?vencendo=${days}`;
  }
  return null;
}

/**
 * Caixa de entrada do app: um registro por destinatário (usuários ativos da empresa com perfil
 * interessado e que não silenciaram a categoria). Roda no contexto da empresa do aviso.
 */
@Injectable()
export class InboxService {
  private readonly logger = new Logger(InboxService.name);

  constructor(private readonly db: TenantPrismaService) {}

  async deliver(notification: Notification): Promise<number> {
    const category = categoryOf(notification.event);
    if (!category) return 0;

    const recipients = await this.db.client.user.findMany({
      where: {
        isActive: true,
        role: { in: RECIPIENT_ROLES[category] },
        NOT: { mutedNotifications: { has: category } },
      },
      select: { id: true },
    });
    if (recipients.length === 0) return 0;

    // O assunto do e-mail vem como "TraceFlow: recall …": na central, sem prefixo e com maiúscula.
    const subject = notification.subject.replace(/^TraceFlow:\s*/, '');
    const title = (subject.charAt(0).toUpperCase() + subject.slice(1)).slice(0, 200);
    const body = notification.body.slice(0, 2000);
    const link = linkOf(notification);
    const { count } = await this.db.client.notification.createMany({
      data: recipients.map((user) => ({
        userId: user.id,
        event: notification.event.slice(0, 60),
        title,
        body,
        link,
      })) as Prisma.NotificationCreateManyInput[],
    });
    this.logger.log({ event: notification.event, recipients: count }, 'In-app notification');
    return count;
  }
}
