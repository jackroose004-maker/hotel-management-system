import { IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator'

export class CreateMenuItemDto {
  @IsString()
  categoryId: string

  @IsString()
  name: string

  @IsString()
  @IsOptional()
  nameAr?: string

  @IsString()
  @IsOptional()
  description?: string

  @IsString()
  @IsOptional()
  descriptionAr?: string

  @IsNumber()
  price: number

  @IsString()
  @IsOptional()
  imageUrl?: string

  @IsNumber()
  @IsOptional()
  prepTimeMins?: number

  @IsBoolean()
  @IsOptional()
  isSpecialDay?: boolean

  @IsString()
  @IsOptional()
  specialLabel?: string
}

export class UpdateMenuItemDto {
  @IsString()
  @IsOptional()
  name?: string

  @IsString()
  @IsOptional()
  nameAr?: string

  @IsNumber()
  @IsOptional()
  price?: number

  @IsString()
  @IsOptional()
  description?: string

  @IsString()
  @IsOptional()
  descriptionAr?: string

  @IsString()
  @IsOptional()
  imageUrl?: string

  @IsBoolean()
  @IsOptional()
  isAvailable?: boolean

  @IsNumber()
  @IsOptional()
  prepTimeMins?: number

  @IsBoolean()
  @IsOptional()
  isSpecialDay?: boolean

  @IsString()
  @IsOptional()
  specialLabel?: string
}
