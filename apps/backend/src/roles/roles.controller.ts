import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common'
import { RolesService } from './roles.service'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { RolesGuard } from '../common/guards/roles.guard'
import { Roles } from '../common/decorators/roles.decorator'
import { Permission } from '../common/permissions'

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('OWNER')
@Controller('roles')
export class RolesController {
  constructor(private roles: RolesService) {}

  @Get()
  findAll() { return this.roles.findAll() }

  @Post()
  create(@Body() body: { name: string; color?: string; permissions: Permission[] }) {
    return this.roles.create(body)
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: { name?: string; color?: string; permissions?: Permission[] }) {
    return this.roles.update(id, body)
  }

  @Delete(':id')
  remove(@Param('id') id: string) { return this.roles.remove(id) }

  @Patch('assign/:userId')
  assign(@Param('userId') userId: string, @Body('staffRoleId') staffRoleId: string | null) {
    return this.roles.assignToUser(userId, staffRoleId)
  }
}
