import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayUnique, IsArray, IsBoolean, IsIn, IsOptional } from 'class-validator';
import { PagingDto } from '../common/http/pagination.js';
import { NOTIFICATION_CATEGORIES, type NotificationCategory } from './inbox.service.js';

export class ListNotificationsQueryDto extends PagingDto {
  @ApiPropertyOptional({ description: 'Só os não lidos', default: false })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  unread = false;
}

export class NotificationResponse {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'recall.executed' }) event!: string;
  @ApiProperty({ enum: NOTIFICATION_CATEGORIES, enumName: 'NotificationCategory' })
  category!: NotificationCategory;
  @ApiProperty({ example: 'Recall RC-2026-000001 (Alta) - 3 lotes bloqueados' }) title!: string;
  @ApiProperty() body!: string;
  @ApiProperty({ type: String, nullable: true, example: '/recall/0190…' }) link!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) readAt!: Date | null;
  @ApiProperty() createdAt!: Date;
}

export class UnreadCountResponse {
  @ApiProperty({ example: 3 }) unread!: number;
}

export class NotificationPreferencesDto {
  @ApiProperty({
    enum: NOTIFICATION_CATEGORIES,
    enumName: 'NotificationCategory',
    isArray: true,
    description: 'Categorias silenciadas na central de avisos',
  })
  @IsArray()
  @ArrayUnique()
  @IsIn(NOTIFICATION_CATEGORIES, { each: true })
  muted!: NotificationCategory[];
}
