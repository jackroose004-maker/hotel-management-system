import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards, Request } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { RolesGuard } from '../common/guards/roles.guard'
import { Roles } from '../common/decorators/roles.decorator'
import { UsersService } from './users.service'

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private users: UsersService) {}

  @UseGuards(RolesGuard)
  @Roles('OWNER', 'STAFF')
  @Get('lookup')
  lookupByEmail(@Query('email') email: string) {
    return this.users.lookupByEmail(email)
  }

  @UseGuards(RolesGuard)
  @Roles('OWNER')
  @Get('staff')
  listStaff() {
    return this.users.listStaff()
  }

  @UseGuards(RolesGuard)
  @Roles('OWNER')
  @Post('staff')
  createStaff(
    @Body() body: { name: string; email: string; password: string; role: string; staffRoleId?: string },
    @Request() req,
  ) {
    return this.users.createStaff(body, req.user.id)
  }

  @UseGuards(RolesGuard)
  @Roles('OWNER')
  @Patch('staff/:id')
  updateStaff(
    @Param('id') id: string,
    @Body() body: { name?: string; email?: string; role?: string; isActive?: boolean; password?: string; staffRoleId?: string | null },
    @Request() req,
  ) {
    return this.users.updateStaff(id, body, req.user.id)
  }
}
