import { Module } from '@nestjs/common'
import { UsersController } from './users.controller'
import { UsersService } from './users.service'
import { PrismaModule } from '../prisma/prisma.module'
import { MailModule } from '../mail/mail.module'
import { ActivityLogModule } from '../activity-log/activity-log.module'

@Module({
  imports: [PrismaModule, MailModule, ActivityLogModule],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
