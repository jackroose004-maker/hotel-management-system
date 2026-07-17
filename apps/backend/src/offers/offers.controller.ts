import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards } from '@nestjs/common'
import { OffersService } from './offers.service'
import type { OfferDto } from './offers.service'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { RolesGuard } from '../common/guards/roles.guard'
import { Roles } from '../common/decorators/roles.decorator'

@Controller('offers')
export class OffersController {
  constructor(private offers: OffersService) {}

  // Public: guest menu/cart reads active offers to show banners + strike-through pricing
  @Get('active')
  getActive() {
    return this.offers.getActiveNow()
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER')
  @Get()
  list() {
    return this.offers.list()
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER')
  @Post()
  create(@Body() dto: OfferDto) {
    return this.offers.create(dto)
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: Partial<OfferDto>) {
    return this.offers.update(id, dto)
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.offers.remove(id)
  }
}
