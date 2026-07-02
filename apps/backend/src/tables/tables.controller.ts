import { Controller, Get, Patch, Post, Body, Param, UseGuards, HttpCode } from '@nestjs/common'
import { TablesService } from './tables.service'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { RolesGuard } from '../common/guards/roles.guard'
import { Roles } from '../common/decorators/roles.decorator'
import { TableStatus } from '@prisma/client'

@Controller('tables')
export class TablesController {
  constructor(private tables: TablesService) {}

  @Get()
  getAll() { return this.tables.getAll() }

  @Get('available')
  getAvailable() { return this.tables.getAvailable() }

  @Get('qr/:qrCode')
  getByQrCode(@Param('qrCode') qrCode: string) { return this.tables.getByQrCode(qrCode) }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'MANAGER', 'STAFF')
  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body('status') status: TableStatus) {
    return this.tables.updateStatus(id, status)
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'MANAGER')
  @Patch(':id/name')
  updateName(@Param('id') id: string, @Body('name') name: string) {
    return this.tables.updateName(id, name)
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'MANAGER')
  @HttpCode(200)
  @Post(':id/regenerate-qr')
  regenerateQr(@Param('id') id: string) {
    return this.tables.regenerateQr(id)
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'MANAGER')
  @Post()
  create(@Body('tableNumber') tableNumber: number, @Body('capacity') capacity: number, @Body('name') name?: string) {
    return this.tables.create(tableNumber, capacity, name)
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'MANAGER')
  @Post('seed-names')
  seedNames() { return this.tables.seedDefaultNames() }
}
