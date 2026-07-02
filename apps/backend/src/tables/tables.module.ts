import { Module } from '@nestjs/common'
import { TablesService } from './tables.service'
import { TablesController } from './tables.controller'
import { TableCleanupService } from './table-cleanup.service'

@Module({
  providers: [TablesService, TableCleanupService],
  controllers: [TablesController],
})
export class TablesModule {}
