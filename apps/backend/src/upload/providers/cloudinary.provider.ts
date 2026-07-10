import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { v2 as cloudinary } from 'cloudinary'
import { IStorageProvider, UploadedFile } from '../storage.interface'

@Injectable()
export class CloudinaryProvider implements IStorageProvider {
  private readonly logger = new Logger(CloudinaryProvider.name)

  constructor(private readonly config: ConfigService) {
    cloudinary.config({
      cloud_name: config.getOrThrow('CLOUDINARY_CLOUD_NAME'),
      api_key:    config.getOrThrow('CLOUDINARY_API_KEY'),
      api_secret: config.getOrThrow('CLOUDINARY_API_SECRET'),
      secure: true,
    })
  }

  async upload(
    buffer: Buffer,
    options: { folder: string; filename: string; mimeType: string },
  ): Promise<UploadedFile> {
    const folder = `${this.config.get('CLOUDINARY_FOLDER', 'al-manzil')}/${options.folder}`

    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder,
          public_id: options.filename,
          resource_type: 'image',
          overwrite: true,
          transformation: [{ quality: 'auto', fetch_format: 'auto' }],
        },
        (err, result) => {
          if (err || !result) return reject(err ?? new Error('Cloudinary upload failed'))
          resolve({
            url: result.secure_url,
            publicId: result.public_id,
            width: result.width,
            height: result.height,
            bytes: result.bytes,
            format: result.format,
          })
        },
      )
      stream.end(buffer)
    })
  }

  async delete(publicId: string): Promise<void> {
    try {
      await cloudinary.uploader.destroy(publicId)
    } catch (err) {
      this.logger.warn(`Failed to delete Cloudinary asset ${publicId}: ${err}`)
    }
  }
}
