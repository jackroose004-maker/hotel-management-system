import { Controller, Get, Patch, Post, Delete, Body, Param, Query, UseGuards, HttpCode, Request } from '@nestjs/common'
import { TablesService } from './tables.service'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { RolesGuard } from '../common/guards/roles.guard'
import { Roles } from '../common/decorators/roles.decorator'
import { TableStatus } from '@prisma/client'

@Controller('tables')
export class TablesController {
  constructor(private tables: TablesService) {}

  @Get()
  getAll(@Query('all') all?: string) { return this.tables.getAll(all === 'true') }

  @Get('available')
  getAvailable() { return this.tables.getAvailable() }

  @Get('qr/:qrCode')
  getByQrCode(@Param('qrCode') qrCode: string) { return this.tables.getByQrCode(qrCode) }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'STAFF')
  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body('status') status: TableStatus) {
    return this.tables.updateStatus(id, status)
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER')
  @Patch(':id/name')
  updateName(@Param('id') id: string, @Body('name') name: string) {
    return this.tables.updateName(id, name)
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER')
  @HttpCode(200)
  @Post(':id/regenerate-qr')
  regenerateQr(@Param('id') id: string) {
    return this.tables.regenerateQr(id)
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER')
  @Post()
  create(
    @Body('tableNumber') tableNumber: number,
    @Body('capacity') capacity: number,
    @Body('name') name?: string,
    @Body('zone') zone?: string,
  ) {
    return this.tables.create(tableNumber, capacity, name, zone)
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER')
  @Patch(':id/active')
  setActive(@Param('id') id: string, @Body('isActive') isActive: boolean) {
    return this.tables.setActive(id, isActive)
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER')
  @Patch(':id/reservable')
  setReservable(@Param('id') id: string, @Body('isReservable') isReservable: boolean) {
    return this.tables.setReservable(id, isReservable)
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body('name') name?: string,
    @Body('capacity') capacity?: number,
    @Body('zone') zone?: string,
  ) {
    return this.tables.update(id, { name, capacity, zone })
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.tables.remove(id)
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER')
  @Post('seed-names')
  seedNames() { return this.tables.seedDefaultNames() }

  // Party Mode: merge 2+ tables into one combined bill
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'STAFF')
  @Post('merge')
  mergeTables(@Body('tableIds') tableIds: string[], @Body('label') label: string, @Request() req: any) {
    return this.tables.mergeTables(tableIds, req.user?.id, label)
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'STAFF')
  @Post('group/:groupId/unmerge')
  unmergeGroup(@Param('groupId') groupId: string) {
    return this.tables.unmergeGroup(groupId)
  }
}
