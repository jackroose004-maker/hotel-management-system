import { Controller, Post, Get, Patch, Body, Param, UseGuards, Request, Query, HttpCode } from '@nestjs/common'
import { OrdersService } from './orders.service'
import { CreateOrderDto, UpdateOrderStatusDto } from './dto/create-order.dto'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt.guard'
import { RolesGuard } from '../common/guards/roles.guard'
import { Roles } from '../common/decorators/roles.decorator'

@Controller('orders')
export class OrdersController {
  constructor(private orders: OrdersService) {}

  // OptionalJwtAuthGuard: if user is logged in their id is attached; guests still work
  @UseGuards(OptionalJwtAuthGuard)
  @Post()
  create(@Body() dto: CreateOrderDto, @Request() req) {
    return this.orders.create(dto, req.user?.id)
  }

  @UseGuards(JwtAuthGuard)
  @Get('mine')
  getMyOrders(@Request() req) {
    return this.orders.getByUser(req.user.id)
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'MANAGER')
  @Get('analytics')
  getAnalytics(@Query('period') period: string = '7d') {
    return this.orders.getAnalytics(period)
  }

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

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'MANAGER', 'STAFF')
  @Get('active-bills')
  getActiveBills() {
    return this.orders.getActiveBills()
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'MANAGER', 'STAFF')
  @Get('closed-bills-today')
  getClosedBillsToday() {
    return this.orders.getClosedBillsToday()
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'MANAGER', 'STAFF')
  @Get('takeaway-today')
  getTakeawayBillsToday() {
    return this.orders.getTakeawayBillsToday()
  }

  // Claim guest orders: after sign-in, link previously anonymous orders to this user
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  @Post('claim')
  claimGuestOrders(@Body('orderIds') orderIds: string[], @Request() req) {
    return this.orders.claimGuestOrders(req.user.id, orderIds ?? [])
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'MANAGER', 'STAFF')
  @Get('session/:sessionId/bill')
  getSessionBill(@Param('sessionId') sessionId: string) {
    return this.orders.getSessionBill(sessionId)
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'MANAGER', 'STAFF')
  @Get('table/:tableId/bill')
  getTableBill(@Param('tableId') tableId: string) {
    return this.orders.getTableBill(tableId)
  }

  // Staff places an order on behalf of a guest — auto-joins current session
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'MANAGER', 'STAFF')
  @Post('table/:tableId/staff-order')
  staffOrder(@Param('tableId') tableId: string, @Body() dto: CreateOrderDto, @Request() req) {
    return this.orders.create({ ...dto, type: 'DINE_IN', tableId }, req.user?.id)
  }

  // Reassign an order to a different session (manager/owner only)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'MANAGER')
  @Patch(':id/reassign-session')
  reassignSession(@Param('id') id: string, @Body('sessionId') sessionId: string) {
    return this.orders.reassignOrderSession(id, sessionId)
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.orders.getById(id)
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'MANAGER', 'STAFF')
  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateOrderStatusDto, @Request() req) {
    return this.orders.updateStatus(id, dto, req.user?.id)
  }

  // Guest self-cancel — only allowed while order is still PENDING
  @UseGuards(OptionalJwtAuthGuard)
  @Post(':id/cancel')
  guestCancel(@Param('id') id: string) {
    return this.orders.guestCancel(id)
  }
}
