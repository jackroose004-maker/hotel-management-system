import { Controller, Post, Get, Patch, Body, Param, UseGuards, Request, Query } from '@nestjs/common'
import { OrdersService } from './orders.service'
import { CreateOrderDto, UpdateOrderStatusDto } from './dto/create-order.dto'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { RolesGuard } from '../common/guards/roles.guard'
import { Roles } from '../common/decorators/roles.decorator'

@Controller('orders')
export class OrdersController {
  constructor(private orders: OrdersService) {}

  // Public — guest places order via QR
  @Post()
  create(@Body() dto: CreateOrderDto, @Request() req) {
    return this.orders.create(dto, req.user?.id)
  }

  // Staff — view all orders
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'MANAGER', 'STAFF')
  @Get()
  getAll(@Query('status') status?: string) {
    return this.orders.getAll(status ? { status: status as any } : undefined)
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'MANAGER', 'STAFF')
  @Get('active')
  getActive() {
    return this.orders.getActiveOrders()
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.orders.getById(id)
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'MANAGER', 'STAFF')
  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateOrderStatusDto) {
    return this.orders.updateStatus(id, dto)
  }
}
