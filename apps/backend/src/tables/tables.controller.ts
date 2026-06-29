import { Controller, Get, Patch, Post, Body, Param, UseGuards } from '@nestjs/common'
import { TablesService } from './tables.service'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { RolesGuard } from '../common/guards/roles.guard'
import { Roles } from '../common/decorators/roles.decorator'
import { TableStatus } from '@prisma/client'

@Controller('tables')
export class TablesController {
  constructor(private tables: TablesService) {}

  @Get()
  getAll() {
    return this.tables.getAll()
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'MANAGER', 'STAFF')
  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body('status') status: TableStatus) {
    return this.tables.updateStatus(id, status)
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'MANAGER')
  @Post()
  create(@Body('tableNumber') tableNumber: number, @Body('capacity') capacity: number) {
    return this.tables.create(tableNumber, capacity)
  }
}
