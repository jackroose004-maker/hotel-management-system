import { Controller, Get, Patch, Post, Param, Body, UseGuards, Req, Res } from '@nestjs/common'
import type { Response, Request } from 'express'
import { SettingsService } from './settings.service'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { RolesGuard } from '../common/guards/roles.guard'
import { Roles } from '../common/decorators/roles.decorator'
import { MailService } from '../mail/mail.service'

@Controller('settings')
export class SettingsController {
  constructor(
    private settings: SettingsService,
    private mail: MailService,
  ) {}

  // Slim public endpoint — only brand/display fields the frontend needs
  @Get('brand')
  getBrand() {
    return this.settings.getBrand()
  }

  // Full settings — used by staff settings page
  @Get()
  get() {
    return this.settings.get()
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER')
  @Patch()
  update(@Body() dto: any) {
    return this.settings.update(dto)
  }

  // ── Email template endpoints ───────────────────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER')
  @Get('email/templates')
  getTemplates() {
    return this.settings.getEmailTemplates()
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER')
  @Patch('email/templates/:id')
  updateTemplate(@Param('id') id: string, @Body() dto: any) {
    return this.settings.updateEmailTemplate(id, dto)
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER')
  @Post('email/preview/:key')
  async previewTemplate(@Param('key') key: string, @Body() overrides: Record<string, any>, @Res() res: Response) {
    const html = await this.settings.previewEmailTemplate(key, overrides)
    res.setHeader('Content-Type', 'text/html')
    res.send(html)
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER')
  @Post('email/test')
  async testEmail(@Body() body: { templateKey: string; to?: string }, @Req() req: Request & { user: { id: string } }) {
    const to = body.to ?? (await this.settings.getUserEmail(req.user.id))
    await this.mail.sendTestEmail(to, body.templateKey)
    return { ok: true }
  }
}
