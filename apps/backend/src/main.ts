import { NestFactory } from '@nestjs/core'
import { ValidationPipe, VersioningType } from '@nestjs/common'
import { AppModule } from './app.module'
import { ResponseInterceptor } from './common/interceptors/response.interceptor'
import { GlobalExceptionFilter } from './common/filters/http-exception.filter'
import { TablesService } from './tables/tables.service'

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
    logger: ['log', 'warn', 'error', 'debug', 'verbose'],
  })

  app.setGlobalPrefix('api')
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: '1' })
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))
  app.useGlobalInterceptors(new ResponseInterceptor())
  app.useGlobalFilters(new GlobalExceptionFilter())
  app.enableCors({ origin: '*', credentials: false })
  app.enableShutdownHooks()

  // Back-fill names for any tables created before this feature
  await app.get(TablesService).seedDefaultNames()

  await app.listen(process.env.PORT || 3001, '0.0.0.0')
  console.log(`Backend running on http://0.0.0.0:${process.env.PORT || 3001}/api/v1`)
}
bootstrap()
