import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common'
import { NotificationsService } from './notifications.service'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private svc: NotificationsService) {}

  @Get()
  findAll(@Req() req, @Query('unread') unread?: string) {
    return this.svc.findForUser(req.user.id, unread === 'true')
  }

  @Get('unread-count')
  unreadCount(@Req() req) {
    return this.svc.unreadCount(req.user.id)
  }

  @Patch('read')
  markRead(@Req() req, @Body('ids') ids: string[]) {
    return this.svc.markRead(req.user.id, ids)
  }

  @Patch('read-all')
  markAllRead(@Req() req) {
    return this.svc.markAllRead(req.user.id)
  }

  // Push token registration
  @Post('device-token')
  upsertToken(@Req() req, @Body() body: { token: string; platform?: string; userAgent?: string }) {
    return this.svc.upsertDeviceToken(req.user.id, body.token, body.platform ?? 'WEB', body.userAgent)
  }

  @Delete('device-token/:token')
  removeToken(@Param('token') token: string) {
    return this.svc.removeDeviceToken(token)
  }
}
