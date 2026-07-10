import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { IStorageProvider, UploadedFile } from '../storage.interface'
import { Readable } from 'stream'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const FormData = require('form-data') as typeof import('form-data')
import axios from 'axios'

@Injectable()
export class CloudinaryProvider implements IStorageProvider {
  private readonly logger = new Logger(CloudinaryProvider.name)
  private readonly cloudName: string
  private readonly preset: string
  private readonly rootFolder: string

  constructor(private readonly config: ConfigService) {
    this.cloudName  = config.getOrThrow('CLOUDINARY_CLOUD_NAME')
    this.preset     = config.get('CLOUDINARY_UPLOAD_PRESET', 'almanzil_uploads')
    this.rootFolder = config.get('CLOUDINARY_FOLDER', 'al-manzil')
  }

  async upload(
    buffer: Buffer,
    options: { folder: string; filename: string; mimeType: string },
  ): Promise<UploadedFile> {
    const publicId = `${this.rootFolder}/${options.folder}/${options.filename}`
    const url = `https://api.cloudinary.com/v1_1/${this.cloudName}/image/upload`

    const form = new FormData()
    form.append('file', Readable.from(buffer), { filename: options.filename, contentType: options.mimeType })
    form.append('upload_preset', this.preset)
    form.append('public_id', publicId)

    const { data } = await axios.post(url, form, { headers: form.getHeaders() })

    return {
      url:      data.secure_url,
      publicId: data.public_id,
      width:    data.width,
      height:   data.height,
      bytes:    data.bytes,
      format:   data.format,
    }
  }

  async delete(publicId: string): Promise<void> {
    // Deletion requires signed auth — silently skip if credentials not configured
    const apiKey    = this.config.get('CLOUDINARY_API_KEY')
    const apiSecret = this.config.get('CLOUDINARY_API_SECRET')
    if (!apiKey || !apiSecret) {
      this.logger.debug(`Skipping delete for ${publicId} — no API credentials`)
      return
    }
    try {
      const { v2: cloudinary } = await import('cloudinary')
      cloudinary.config({ cloud_name: this.cloudName, api_key: apiKey, api_secret: apiSecret, secure: true })
      await cloudinary.uploader.destroy(publicId)
    } catch (err) {
      this.logger.warn(`Failed to delete Cloudinary asset ${publicId}: ${err}`)
    }
  }
}
