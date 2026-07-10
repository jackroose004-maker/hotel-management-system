import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { IStorageProvider, UploadedFile } from '../storage.interface'

@Injectable()
export class S3Provider implements IStorageProvider {
  private readonly logger = new Logger(S3Provider.name)
  private readonly client: S3Client
  private readonly bucket: string
  private readonly publicUrl: string

  constructor(private readonly config: ConfigService) {
    this.bucket    = config.getOrThrow('S3_BUCKET')
    this.publicUrl = config.getOrThrow('S3_PUBLIC_URL').replace(/\/$/, '')

    this.client = new S3Client({
      region: config.get('S3_REGION', 'auto'),
      endpoint: config.get('S3_ENDPOINT'),   // set for R2: https://<account>.r2.cloudflarestorage.com
      credentials: {
        accessKeyId:     config.getOrThrow('S3_ACCESS_KEY_ID'),
        secretAccessKey: config.getOrThrow('S3_SECRET_ACCESS_KEY'),
      },
      forcePathStyle: !!config.get('S3_ENDPOINT'), // required for R2 / custom endpoints
    })
  }

  async upload(
    buffer: Buffer,
    options: { folder: string; filename: string; mimeType: string },
  ): Promise<UploadedFile> {
    const key = `${options.folder}/${options.filename}`

    await this.client.send(new PutObjectCommand({
      Bucket:      this.bucket,
      Key:         key,
      Body:        buffer,
      ContentType: options.mimeType,
      CacheControl: 'public, max-age=31536000, immutable',
    }))

    return {
      url:      `${this.publicUrl}/${key}`,
      publicId: key,
    }
  }

  async delete(publicId: string): Promise<void> {
    try {
      await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: publicId }))
    } catch (err) {
      this.logger.warn(`Failed to delete S3 object ${publicId}: ${err}`)
    }
  }
}
