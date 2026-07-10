import { BadRequestException, Inject, Injectable } from '@nestjs/common'
// eslint-disable-next-line @typescript-eslint/no-require-imports
const sharp = require('sharp') as typeof import('sharp')
import type { IStorageProvider, UploadedFile } from './storage.interface'
import { STORAGE_PROVIDER } from './storage.interface'

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml']
const MAX_BYTES = 8 * 1024 * 1024 // 8 MB

export type UploadFolder = 'logos' | 'menu' | 'backgrounds' | 'general' | 'avatars'

@Injectable()
export class UploadService {
  constructor(
    @Inject(STORAGE_PROVIDER) private readonly storage: IStorageProvider,
  ) {}

  async uploadImage(
    file: Express.Multer.File,
    folder: UploadFolder = 'general',
  ): Promise<UploadedFile> {
    if (!ALLOWED_MIME.includes(file.mimetype)) {
      throw new BadRequestException(`File type ${file.mimetype} not allowed. Use JPEG, PNG, WebP, GIF, or SVG.`)
    }
    if (file.size > MAX_BYTES) {
      throw new BadRequestException(`File too large (max 8 MB)`)
    }

    let buffer = file.buffer
    let mimeType = file.mimetype

    // Convert raster images to WebP for better compression (skip SVG and GIF)
    if (!['image/svg+xml', 'image/gif'].includes(file.mimetype)) {
      buffer = await sharp(file.buffer)
        .rotate()              // auto-orient from EXIF
        .resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 85 })
        .toBuffer()
      mimeType = 'image/webp'
    }

    const ext = mimeType === 'image/webp' ? 'webp'
      : mimeType === 'image/svg+xml' ? 'svg'
      : mimeType === 'image/gif' ? 'gif'
      : 'webp'

    const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

    return this.storage.upload(buffer, { folder, filename, mimeType })
  }

  async deleteImage(publicId: string): Promise<void> {
    return this.storage.delete(publicId)
  }
}
