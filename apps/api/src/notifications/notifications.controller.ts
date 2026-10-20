import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiNotFoundResponse, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { ApiPageResponse, type Page } from '../common/http/pagination.js';
import {
  ListNotificationsQueryDto,
  NotificationPreferencesDto,
  NotificationResponse,
  UnreadCountResponse,
} from './notifications.dto.js';
import { NotificationsService } from './notifications.service.js';

/** Central de avisos do usuário logado (todos os perfis). */
@ApiTags('notifications')
@ApiBearerAuth()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @ApiPageResponse(NotificationResponse)
  list(@Query() query: ListNotificationsQueryDto): Promise<Page<NotificationResponse>> {
    return this.notifications.list(query);
  }

  @Get('unread-count')
  @ApiOkResponse({ type: UnreadCountResponse })
  unreadCount(): Promise<UnreadCountResponse> {
    return this.notifications.unreadCount();
  }

  @Post('read-all')
  @HttpCode(200)
  @ApiOkResponse({ schema: { properties: { updated: { type: 'number' } } } })
  markAllRead(): Promise<{ updated: number }> {
    return this.notifications.markAllRead();
  }

  @Post(':id/read')
  @HttpCode(200)
  @ApiOkResponse({ type: NotificationResponse })
  @ApiNotFoundResponse()
  markRead(@Param('id', ParseUUIDPipe) id: string): Promise<NotificationResponse> {
    return this.notifications.markRead(id);
  }

  @Get('preferences')
  @ApiOkResponse({ type: NotificationPreferencesDto })
  preferences(): Promise<NotificationPreferencesDto> {
    return this.notifications.preferences();
  }

  @Put('preferences')
  @ApiOkResponse({ type: NotificationPreferencesDto })
  setPreferences(@Body() dto: NotificationPreferencesDto): Promise<NotificationPreferencesDto> {
    return this.notifications.setPreferences(dto);
  }
}
