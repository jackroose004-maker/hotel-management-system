import { Controller, Post, Body, Request, UseGuards } from '@nestjs/common'
import { PushService } from './push.service'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'

@Controller('push')
export class PushController {
  constructor(private push: PushService) {}

  // Staff/customer registers this browser for push. Role comes from the JWT.
  @UseGuards(JwtAuthGuard)
  @Post('subscribe')
  subscribe(@Body() body: { endpoint: string; keys: { p256dh: string; auth: string } }, @Request() req: any) {
    const isStaff = req.user?.role && ['STAFF', 'OWNER'].includes(req.user.role)
    return this.push.subscribe(body, req.user?.id, isStaff ? 'STAFF' : 'CUSTOMER')
  }

  @Post('unsubscribe')
  unsubscribe(@Body('endpoint') endpoint: string) {
    return this.push.unsubscribe(endpoint)
  }
}
