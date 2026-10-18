import { Injectable } from '@nestjs/common';
import { pageArgs, toPage, type Page } from '../common/http/pagination.js';
import type { Notification, Prisma } from '../generated/prisma/client.js';
import { TenantContext } from '../tenancy/tenant-context.js';
import { TenantPrismaService } from '../tenancy/tenant-prisma.service.js';
import { categoryOf, NOTIFICATION_CATEGORIES, type NotificationCategory } from './inbox.service.js';
import type {
  ListNotificationsQueryDto,
  NotificationPreferencesDto,
  NotificationResponse,
} from './notifications.dto.js';

/** Central de avisos do usuário logado: cada um só vê e marca os próprios avisos. */
@Injectable()
export class NotificationsService {
  constructor(
    private readonly db: TenantPrismaService,
    private readonly tenant: TenantContext,
  ) {}

  private mine(): Prisma.NotificationWhereInput {
    return { userId: this.tenant.requireUserId() };
  }

  async list(query: ListNotificationsQueryDto): Promise<Page<NotificationResponse>> {
    const where: Prisma.NotificationWhereInput = {
      ...this.mine(),
      ...(query.unread && { readAt: null }),
    };
    const [rows, total] = await Promise.all([
      this.db.client.notification.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...pageArgs(query),
      }),
      this.db.client.notification.count({ where }),
    ]);
    return toPage(rows.map(toResponse), total, query);
  }

  async unreadCount(): Promise<{ unread: number }> {
    return {
      unread: await this.db.client.notification.count({ where: { ...this.mine(), readAt: null } }),
    };
  }

  /** Idempotente; aviso de outro usuário (ou empresa) responde 404. */
  async markRead(id: string): Promise<NotificationResponse> {
    const notification = await this.db.client.notification.findFirstOrThrow({
      where: { id, ...this.mine() },
    });
    if (notification.readAt) return toResponse(notification);
    return toResponse(
      await this.db.client.notification.update({
        where: { id },
        data: { readAt: new Date() },
      }),
    );
  }

  async markAllRead(): Promise<{ updated: number }> {
    const { count } = await this.db.client.notification.updateMany({
      where: { ...this.mine(), readAt: null },
      data: { readAt: new Date() },
    });
    return { updated: count };
  }

  async preferences(): Promise<NotificationPreferencesDto> {
    const user = await this.db.client.user.findUniqueOrThrow({
      where: { id: this.tenant.requireUserId() },
      select: { mutedNotifications: true },
    });
    return { muted: user.mutedNotifications.filter(isCategory) };
  }

  async setPreferences(dto: NotificationPreferencesDto): Promise<NotificationPreferencesDto> {
    const user = await this.db.client.user.update({
      where: { id: this.tenant.requireUserId() },
      data: { mutedNotifications: dto.muted },
      select: { mutedNotifications: true },
    });
    return { muted: user.mutedNotifications.filter(isCategory) };
  }
}

function isCategory(value: string): value is NotificationCategory {
  return (NOTIFICATION_CATEGORIES as readonly string[]).includes(value);
}

function toResponse(row: Notification): NotificationResponse {
  return {
    id: row.id,
    event: row.event,
    category: categoryOf(row.event) ?? 'recall',
    title: row.title,
    body: row.body,
    link: row.link,
    readAt: row.readAt,
    createdAt: row.createdAt,
  };
}
