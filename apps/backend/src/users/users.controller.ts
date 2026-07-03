import { Controller, Get, Post, Patch, Body, Param, UseGuards, Request } from '@nestjs/common'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { RolesGuard } from '../common/guards/roles.guard'
import { Roles } from '../common/decorators/roles.decorator'
import { UsersService } from './users.service'

@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(private users: UsersService) {}

  @Get('staff')
  @Roles('OWNER', 'MANAGER')
  listStaff() {
    return this.users.listStaff()
  }

  @Post('staff')
  @Roles('OWNER')
  createStaff(@Body() body: { name: string; email: string; password: string; role: string }) {
    return this.users.createStaff(body)
  }

  @Patch('staff/:id')
  @Roles('OWNER')
  updateStaff(
    @Param('id') id: string,
    @Body() body: { name?: string; role?: string; isActive?: boolean; password?: string },
    @Request() req,
  ) {
    return this.users.updateStaff(id, body, req.user.id)
  }
}
