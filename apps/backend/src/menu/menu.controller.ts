import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, Query, UploadedFile, UseInterceptors, BadRequestException } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { MenuService } from './menu.service'
import { MenuImportService } from './menu-import.service'
import { CreateCategoryDto } from './dto/create-category.dto'
import { CreateMenuItemDto, UpdateMenuItemDto } from './dto/create-menu-item.dto'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { RolesGuard } from '../common/guards/roles.guard'
import { Roles } from '../common/decorators/roles.decorator'

@Controller('menu')
export class MenuController {
  constructor(private menu: MenuService, private menuImport: MenuImportService) {}

  // Public
  @Get('categories')
  getCategories() { return this.menu.getCategories() }

  @Get('categories/:categoryId/items')
  getCategoryItems(
    @Param('categoryId') categoryId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const parsed = limit ? parseInt(limit, 10) : 12
    return this.menu.getCategoryItems(categoryId, cursor, Number.isFinite(parsed) ? parsed : 12)
  }

  @Get('items/:id')
  getItem(@Param('id') id: string) { return this.menu.getItem(id) }

  @Get('items')
  getItems(
    @Query('all') all: string,
    @Query('categoryId') categoryId?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    if (categoryId) {
      const parsed = limit ? parseInt(limit, 10) : 12
      return this.menu.getCategoryItems(categoryId, cursor, Number.isFinite(parsed) ? parsed : 12)
    }
    return this.menu.getAllItems(all === 'true')
  }

  // Staff protected
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER')
  @Patch('categories/reorder')
  reorderCategories(@Body() body: { ids: string[] }) { return this.menu.reorderCategories(body.ids) }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER')
  @Post('categories')
  createCategory(@Body() dto: CreateCategoryDto) { return this.menu.createCategory(dto) }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER')
  @Post('items')
  createItem(@Body() dto: CreateMenuItemDto) { return this.menu.createItem(dto) }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER')
  @Patch('items/:id')
  updateItem(@Param('id') id: string, @Body() dto: UpdateMenuItemDto) { return this.menu.updateItem(id, dto) }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'STAFF')
  @Patch('items/:id/toggle')
  toggleAvailability(@Param('id') id: string) { return this.menu.toggleAvailability(id) }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER')
  @Delete('items/:id')
  deleteItem(@Param('id') id: string) { return this.menu.deleteItem(id) }

  // ─── Modifier Groups ──────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER')
  @Post('items/:itemId/modifier-groups')
  createModifierGroup(@Param('itemId') itemId: string, @Body() body: any) {
    return this.menu.createModifierGroup(itemId, body)
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER')
  @Patch('modifier-groups/:id')
  updateModifierGroup(@Param('id') id: string, @Body() body: any) {
    return this.menu.updateModifierGroup(id, body)
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER')
  @Delete('modifier-groups/:id')
  deleteModifierGroup(@Param('id') id: string) {
    return this.menu.deleteModifierGroup(id)
  }

  // ─── Import / Export ─────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER')
  @Post('import/preview')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  importPreview(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded.')
    return this.menuImport.parseFile(file.buffer, file.mimetype)
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER')
  @Post('import/bulk')
  importBulk(@Body() body: { rows: any[]; mode?: 'merge' | 'replace' }) {
    if (!body?.rows?.length) throw new BadRequestException('No rows provided.')
    return this.menuImport.bulkImport(body.rows, body.mode ?? 'merge')
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER')
  @Get('export')
  async exportMenu() {
    const buffer = await this.menuImport.exportToXlsx()
    return { base64: buffer.toString('base64') }
  }

  // ─── Modifier Options ─────────────────────────────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER')
  @Post('modifier-groups/:groupId/options')
  createModifierOption(@Param('groupId') groupId: string, @Body() body: any) {
    return this.menu.createModifierOption(groupId, body)
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER')
  @Patch('modifier-options/:id')
  updateModifierOption(@Param('id') id: string, @Body() body: any) {
    return this.menu.updateModifierOption(id, body)
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER')
  @Delete('modifier-options/:id')
  deleteModifierOption(@Param('id') id: string) {
    return this.menu.deleteModifierOption(id)
  }
}
