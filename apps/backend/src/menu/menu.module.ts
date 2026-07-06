import { Module } from '@nestjs/common'
import { MenuService } from './menu.service'
import { MenuImportService } from './menu-import.service'
import { MenuController } from './menu.controller'

@Module({
  providers: [MenuService, MenuImportService],
  controllers: [MenuController],
  exports: [MenuService],
})
export class MenuModule {}
