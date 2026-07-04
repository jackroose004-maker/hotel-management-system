import { IsArray, IsEnum, IsOptional, IsString, ValidateNested, IsInt, Min } from 'class-validator'
import { Type } from 'class-transformer'
import { OrderType, PaymentMethod } from '@prisma/client'

export class OrderItemDto {
  @IsString()
  menuItemId: string

  @IsInt()
  @Min(1)
  quantity: number

  @IsString()
  @IsOptional()
  notes?: string
}

export class CreateOrderDto {
  @IsEnum(OrderType)
  type: OrderType

  @IsString()
  @IsOptional()
  tableId?: string

  @IsString()
  @IsOptional()
  notes?: string

  // Device-generated token that identifies one person's tab at a table.
  // Each device/phone that scans the QR generates its own UUID → their personal bill.
  @IsString()
  @IsOptional()
  guestTabToken?: string

  // Takeaway: phone number to call/SMS when order is ready
  @IsString()
  @IsOptional()
  contactPhone?: string

  /** Set CASH for dine-in "pay when leaving" — registers payment in same request */
  @IsEnum(PaymentMethod)
  @IsOptional()
  paymentMethod?: PaymentMethod

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[]
}

export class UpdateOrderStatusDto {
  @IsEnum(['PENDING', 'ACCEPTED', 'PREPARING', 'READY', 'DELIVERED', 'CANCELLED'])
  status: string

  @IsString()
  @IsOptional()
  cancelReason?: string
}
