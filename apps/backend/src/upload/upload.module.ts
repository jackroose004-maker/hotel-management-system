import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { UploadController } from './upload.controller'
import { UploadService } from './upload.service'
import { CloudinaryProvider } from './providers/cloudinary.provider'
import { S3Provider } from './providers/s3.provider'
import { STORAGE_PROVIDER } from './storage.interface'

@Module({
  imports: [ConfigModule],
  controllers: [UploadController],
  providers: [
    {
      provide: STORAGE_PROVIDER,
      inject:  [ConfigService],
      useFactory: (config: ConfigService) => {
        const provider = config.get<string>('UPLOAD_PROVIDER', 'cloudinary')
        if (provider === 's3') return new S3Provider(config)
        return new CloudinaryProvider(config)
      },
    },
    UploadService,
  ],
  exports: [UploadService],
})
export class UploadModule {}
