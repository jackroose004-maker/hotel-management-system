import { Module } from '@nestjs/common'
import { BillsService } from './bills.service'
import { BillsController } from './bills.controller'
import { PrismaModule } from '../prisma/prisma.module'

@Module({
  imports: [PrismaModule],
  providers: [BillsService],
  controllers: [BillsController],
  exports: [BillsService],
})
export class BillsModule {}
