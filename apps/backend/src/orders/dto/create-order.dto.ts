import { IsArray, IsEnum, IsOptional, IsString, IsNumber, ValidateNested, IsInt, Min } from 'class-validator'
import { Type } from 'class-transformer'
import { OrderType } from '@prisma/client'

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

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[]
}

export class UpdateOrderStatusDto {
  @IsEnum(['PENDING', 'ACCEPTED', 'PREPARING', 'READY', 'DELIVERED', 'CANCELLED'])
  status: string
}
