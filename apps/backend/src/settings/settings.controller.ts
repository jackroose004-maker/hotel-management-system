import { Controller, Get, Patch, Body, UseGuards } from '@nestjs/common'
import { SettingsService } from './settings.service'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { RolesGuard } from '../common/guards/roles.guard'
import { Roles } from '../common/decorators/roles.decorator'

@Controller('settings')
export class SettingsController {
  constructor(private settings: SettingsService) {}

  // Public — frontend reads restaurant name, hours, etc.
  @Get()
  get() {
    return this.settings.get()
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'MANAGER')
  @Patch()
  update(@Body() dto: any) {
    return this.settings.update(dto)
  }
}
