import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { IStorageProvider, UploadedFile } from '../storage.interface'
import { Readable } from 'stream'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const FormData = require('form-data') as typeof import('form-data')
import { request as httpsRequest } from 'https'

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
    const isVideo = options.mimeType.startsWith('video/')
    const resourceType = isVideo ? 'video' : 'image'
    // Cloudinary appends the format extension automatically — strip it from public_id to avoid double extension
    const nameWithoutExt = options.filename.replace(/\.[^.]+$/, '')
    const publicId = `${this.rootFolder}/${options.folder}/${nameWithoutExt}`
    const url = `https://api.cloudinary.com/v1_1/${this.cloudName}/${resourceType}/upload`

    const form = new FormData()
    form.append('file', Readable.from(buffer), { filename: options.filename, contentType: options.mimeType })
    form.append('upload_preset', this.preset)
    form.append('public_id', publicId)

    const data = await new Promise<any>((resolve, reject) => {
      const headers = { ...form.getHeaders() }
      const parsed = new URL(url)
      const req = httpsRequest({ hostname: parsed.hostname, path: parsed.pathname, method: 'POST', headers }, res => {
        let body = ''
        res.on('data', chunk => { body += chunk })
        res.on('end', () => {
          try { resolve(JSON.parse(body)) } catch { reject(new Error('Invalid JSON from Cloudinary')) }
        })
      })
      req.on('error', reject)
      form.pipe(req)
    })

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
