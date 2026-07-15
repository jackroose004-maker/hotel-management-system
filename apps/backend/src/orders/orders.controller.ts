import { Controller, Post, Get, Patch, Body, Param, UseGuards, Request, Query, HttpCode, ForbiddenException } from '@nestjs/common'
import { OrdersService } from './orders.service'
import { CreateOrderDto, UpdateOrderStatusDto, AddOrderItemsDto } from './dto/create-order.dto'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { OptionalJwtAuthGuard } from '../auth/guards/optional-jwt.guard'
import { RolesGuard } from '../common/guards/roles.guard'
import { Roles } from '../common/decorators/roles.decorator'

@Controller('orders')
export class OrdersController {
  constructor(private orders: OrdersService) {}

  // OptionalJwtAuthGuard: if user is logged in their id is attached; guests still work
  // When staff/manager/owner use the guest menu (/menu), treat as guest order (no userId)
  // so it doesn't pollute their personal order history and joins the table session correctly
  @UseGuards(OptionalJwtAuthGuard)
  @Post()
  create(@Body() dto: CreateOrderDto, @Request() req) {
    const user = req.user
    const isStaff = user?.role && ['STAFF', 'OWNER'].includes(user.role)
    const clientIp: string | undefined =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ??
      req.socket?.remoteAddress ??
      undefined
    return this.orders.create(dto, isStaff ? undefined : user?.id, clientIp, !!isStaff)
  }

  @UseGuards(JwtAuthGuard)
  @Get('my-ip')
  getMyIp(@Request() req) {
    const ip: string =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ??
      req.socket?.remoteAddress ??
      ''
    return { ip }
  }

  @UseGuards(JwtAuthGuard)
  @Get('mine')
  getMyOrders(@Request() req) {
    return this.orders.getByUser(req.user.id)
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER')
  @Get('analytics')
  getAnalytics(@Query('period') period: string = '7d') {
    return this.orders.getAnalytics(period)
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER')
  @Get('eod-report')
  getEodReport(@Query('date') date?: string) {
    return this.orders.getEodReport(date)
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'STAFF')
  @Get()
  getAll(@Query('status') status?: string) {
    return this.orders.getAll(status ? { status: status as any } : undefined)
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'STAFF')
  @Get('active')
  getActive() {
    return this.orders.getActiveOrders()
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'STAFF')
  @Get('active-bills')
  getActiveBills() {
    return this.orders.getActiveBills()
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'STAFF')
  @Get('closed-bills-today')
  getClosedBillsToday(@Query('date') date?: string) {
    return this.orders.getClosedBillsToday(date)
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'STAFF')
  @Get('takeaway-today')
  getTakeawayBillsToday(@Query('date') date?: string) {
    return this.orders.getTakeawayBillsToday(date)
  }

  // Claim guest orders: after sign-in, link previously anonymous orders to this user
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  @Post('claim')
  claimGuestOrders(@Body('orderIds') orderIds: string[], @Request() req) {
    return this.orders.claimGuestOrders(req.user.id, orderIds ?? [])
  }

  // Guest fetches their own active orders by sessionStorage token — no auth required
  // Used to show staff-placed orders that were linked to this guest's session
  @Get('by-session/:token')
  getBySessionToken(@Param('token') token: string) {
    return this.orders.getBySessionToken(token)
  }

  // Active guest sessions at a table — staff uses this to pick who they're ordering for
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'STAFF')
  @Get('table/:tableId/sessions')
  getTableSessions(@Param('tableId') tableId: string) {
    return this.orders.getTableSessions(tableId)
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'STAFF')
  @Get('session/:sessionId/bill')
  getSessionBill(@Param('sessionId') sessionId: string) {
    return this.orders.getSessionBill(sessionId)
  }

  // Public — no auth — for shareable receipt link
  @Get('session/:sessionId/receipt')
  getSessionReceipt(@Param('sessionId') sessionId: string) {
    return this.orders.getSessionReceipt(sessionId)
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'STAFF')
  @Post('session/:sessionId/convert-to-takeaway')
  convertToTakeaway(@Param('sessionId') sessionId: string, @Body('orderIds') orderIds?: string[]) {
    return this.orders.convertSessionToTakeaway(sessionId, orderIds)
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'STAFF')
  @Get('table/:tableId/bill')
  getTableBill(@Param('tableId') tableId: string) {
    return this.orders.getTableBill(tableId)
  }

  // Staff places an order on behalf of a guest — never assign to staff userId
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'STAFF')
  @Post('table/:tableId/staff-order')
  staffOrder(@Param('tableId') tableId: string, @Body() dto: CreateOrderDto) {
    // Pass undefined userId so the order joins the table's existing customer session,
    // not a new session under the staff member's account
    return this.orders.create({ ...dto, type: 'DINE_IN', tableId }, undefined, undefined, true)
  }

  // Save a pre-order against a booking (held, not sent to kitchen until guest arrives)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'STAFF')
  @Post('booking/:bookingId/pre-order')
  createPreOrder(
    @Param('bookingId') bookingId: string,
    @Body() body: CreateOrderDto & { tempPassword?: string; deferred?: boolean },
    @Request() req,
  ) {
    const { tempPassword, deferred, ...dto } = body
    return this.orders.createPreOrder(bookingId, dto, req.user.id, tempPassword, deferred)
  }

  // Guest has physically arrived — mark table OCCUPIED and fire pre-order to kitchen if not yet sent
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'STAFF')
  @Post('booking/:bookingId/check-in')
  checkInGuest(@Param('bookingId') bookingId: string) {
    return this.orders.checkInGuest(bookingId)
  }

  // Get current pre-order for a booking
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'STAFF')
  @Get('booking/:bookingId/pre-order')
  getPreOrder(@Param('bookingId') bookingId: string) {
    return this.orders.getPreOrder(bookingId)
  }

  // Transfer an entire session to a different table
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'STAFF')
  @Post('session/:sessionId/transfer')
  transferSession(@Param('sessionId') sessionId: string, @Body('toTableId') toTableId: string) {
    return this.orders.transferSession(sessionId, toTableId)
  }

  // Reassign an order to a different session (manager/owner only)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER')
  @Patch(':id/reassign-session')
  reassignSession(@Param('id') id: string, @Body('sessionId') sessionId: string) {
    return this.orders.reassignOrderSession(id, sessionId)
  }

  // Public: recent 4-5 star reviews with comments — no auth required
  @Get('reviews/public')
  getPublicReviews(@Query('limit') limit?: string) {
    return this.orders.getPublicReviews(limit ? Math.min(parseInt(limit), 20) : 12)
  }

  // Guest submits feedback after order is delivered — no auth required
  @UseGuards(OptionalJwtAuthGuard)
  @Post(':id/feedback')
  submitFeedback(
    @Param('id') orderId: string,
    @Body('rating') rating: number,
    @Body('comment') comment?: string,
    @Body('tags') tags?: string,
    @Request() req?: any,
  ) {
    return this.orders.submitFeedback(orderId, { rating, comment, tags }, req?.user?.id)
  }

  // Manager/owner: list all pending refund requests (must be before :id wildcard)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER')
  @Get('pending-refunds')
  getPendingRefunds() {
    return this.orders.getPendingRefunds()
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.orders.getById(id)
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'STAFF')
  @Patch(':id/rush')
  setRush(@Param('id') id: string, @Body('isRush') isRush: boolean) {
    return this.orders.setRush(id, isRush)
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'STAFF')
  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateOrderStatusDto, @Request() req) {
    return this.orders.updateStatus(id, dto, req.user?.id)
  }

  // Guest "Need help?" — fires order:help WebSocket event to all staff screens
  @UseGuards(OptionalJwtAuthGuard)
  @Post(':id/help')
  guestHelp(@Param('id') id: string, @Body('message') message?: string) {
    return this.orders.guestHelp(id, message)
  }

  // Staff reply to guest — fires order:message WebSocket event visible on tracking page
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'STAFF')
  @Post(':id/message')
  staffMessage(@Param('id') id: string, @Body('message') message: string, @Request() req) {
    return this.orders.staffMessage(id, message, req.user?.name ?? 'Staff')
  }

  // Guest self-cancel — only allowed while order is still PENDING
  @UseGuards(OptionalJwtAuthGuard)
  @Post(':id/cancel')
  guestCancel(@Param('id') id: string, @Body('cancelReason') cancelReason?: string) {
    return this.orders.guestCancel(id, cancelReason)
  }

  // Void READY or DELIVERED order — removes it from the bill (MANAGER/OWNER only)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'STAFF')
  @Post(':id/items')
  addItems(@Param('id') id: string, @Body() dto: AddOrderItemsDto, @Request() req) {
    return this.orders.addItems(id, dto, req.user?.id)
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER')
  @Post(':id/void')
  voidOrder(@Param('id') id: string, @Body('reason') reason: string, @Request() req) {
    return this.orders.voidOrder(id, reason, req.user?.id)
  }

  // Any staff can request a refund — goes to manager for approval
  @UseGuards(JwtAuthGuard)
  @Post(':id/refund')
  refundOrder(
    @Param('id') id: string,
    @Body('reason') reason: string,
    @Request() req,
  ) {
    return this.orders.refundOrder(id, reason, req.user.id)
  }

  // Manager/owner: approve a pending refund request
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER')
  @Post(':id/approve-refund')
  approveRefund(@Param('id') id: string, @Request() req) {
    return this.orders.approveRefund(id, req.user.id)
  }

  // Manager/owner: reject a refund request — money stays collected
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER')
  @Post(':id/reject-refund')
  rejectRefund(@Param('id') id: string, @Body('reason') reason: string, @Request() req) {
    return this.orders.rejectRefund(id, req.user.id, reason)
  }

}
