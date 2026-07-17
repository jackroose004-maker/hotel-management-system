import { IsArray, IsEnum, IsOptional, IsString, ValidateNested, IsInt, IsNumber, Min } from 'class-validator'
import { Type } from 'class-transformer'
import { OrderType, PaymentMethod } from '@prisma/client'

export class OrderItemModifierDto {
  @IsString()
  optionId: string

  @IsString()
  name: string

  @IsString()
  @IsOptional()
  groupName?: string

  @IsNumber()
  priceAdd: number
}

export class OrderItemDto {
  @IsString()
  menuItemId: string

  @IsInt()
  @Min(1)
  quantity: number

  @IsString()
  @IsOptional()
  notes?: string

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemModifierDto)
  @IsOptional()
  modifiers?: OrderItemModifierDto[]

  /** Staff-only: live quote for ASP (market-price) items, e.g. today's fish rate. Ignored for guest orders. */
  @IsNumber()
  @IsOptional()
  customPrice?: number
}

export class AddOrderItemsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[]
}

export class CreateOrderDto {
  @IsEnum(OrderType)
  @IsOptional()
  type: OrderType

  @IsString()
  @IsOptional()
  tableId?: string

  @IsString()
  @IsOptional()
  notes?: string

  @IsString()
  @IsOptional()
  guestTabToken?: string

  @IsString()
  @IsOptional()
  contactPhone?: string

  /** If set, order is held as PRE_ORDER and fires to kitchen on guest arrival */
  @IsString()
  @IsOptional()
  bookingId?: string

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
