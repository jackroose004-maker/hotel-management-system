import { IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator'

export class CreateCategoryDto {
  @IsString()
  name: string

  @IsString()
  @IsOptional()
  nameAr?: string

  @IsNumber()
  @IsOptional()
  sortOrder?: number
}
