import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { ScheduleModule } from '@nestjs/schedule'
import { PrismaModule } from './prisma/prisma.module'
import { AuthModule } from './auth/auth.module'
import { MenuModule } from './menu/menu.module'
import { OrdersModule } from './orders/orders.module'
import { TablesModule } from './tables/tables.module'
import { WebsocketModule } from './websocket/websocket.module'
import { PaymentsModule } from './payments/payments.module'
import { BookingsModule } from './bookings/bookings.module'
import { SettingsModule } from './settings/settings.module'
import { ActivityLogModule } from './activity-log/activity-log.module'
import { NotificationsModule } from './notifications/notifications.module'
import { ReportsModule } from './reports/reports.module'
import { UsersModule } from './users/users.module'
import { RolesModule } from './roles/roles.module'
import { ShiftsModule } from './shifts/shifts.module'
import { LoggerMiddleware } from './common/middleware/logger.middleware'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    MenuModule,
    OrdersModule,
    TablesModule,
    WebsocketModule,
    PaymentsModule,
    BookingsModule,
    SettingsModule,
    ActivityLogModule,
    NotificationsModule,
    ReportsModule,
    UsersModule,
    RolesModule,
    ShiftsModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggerMiddleware).forRoutes('*')
  }
}
