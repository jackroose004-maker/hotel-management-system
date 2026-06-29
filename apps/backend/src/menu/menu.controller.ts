import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, Query } from '@nestjs/common'
import { MenuService } from './menu.service'
import { CreateCategoryDto } from './dto/create-category.dto'
import { CreateMenuItemDto, UpdateMenuItemDto } from './dto/create-menu-item.dto'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { RolesGuard } from '../common/guards/roles.guard'
import { Roles } from '../common/decorators/roles.decorator'

@Controller('menu')
export class MenuController {
  constructor(private menu: MenuService) {}

  // Public
  @Get('categories')
  getCategories() {
    return this.menu.getCategories()
  }

  @Get('items')
  getItems(@Query('all') all: string) {
    return this.menu.getAllItems(all === 'true')
  }

  // Staff protected
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'MANAGER')
  @Post('categories')
  createCategory(@Body() dto: CreateCategoryDto) {
    return this.menu.createCategory(dto)
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'MANAGER')
  @Post('items')
  createItem(@Body() dto: CreateMenuItemDto) {
    return this.menu.createItem(dto)
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'MANAGER')
  @Patch('items/:id')
  updateItem(@Param('id') id: string, @Body() dto: UpdateMenuItemDto) {
    return this.menu.updateItem(id, dto)
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'MANAGER', 'STAFF')
  @Patch('items/:id/toggle')
  toggleAvailability(@Param('id') id: string) {
    return this.menu.toggleAvailability(id)
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER')
  @Delete('items/:id')
  deleteItem(@Param('id') id: string) {
    return this.menu.deleteItem(id)
  }
}
