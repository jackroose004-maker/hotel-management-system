import {
  Controller, Post, UploadedFile, UseInterceptors, UseGuards,
  BadRequestException, Body,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { memoryStorage } from 'multer'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { UploadService, UploadFolder } from './upload.service'

const VALID_FOLDERS: UploadFolder[] = ['logos', 'menu', 'backgrounds', 'general', 'avatars']

function resolveFolder(folder?: string): UploadFolder {
  return VALID_FOLDERS.includes(folder as UploadFolder) ? (folder as UploadFolder) : 'general'
}

@Controller('upload')
@UseGuards(JwtAuthGuard)
export class UploadController {
  constructor(private readonly uploadService: UploadService) {}

  @Post('image')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 8 * 1024 * 1024 },
    }),
  )
  async uploadImage(
    @UploadedFile() file: Express.Multer.File,
    @Body('folder') folder?: string,
  ) {
    if (!file) throw new BadRequestException('No file provided')
    const result = await this.uploadService.uploadImage(file, resolveFolder(folder))
    return { url: result.url, publicId: result.publicId, width: result.width, height: result.height, bytes: result.bytes, format: result.format }
  }

  @Post('video')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 100 * 1024 * 1024 },
    }),
  )
  async uploadVideo(
    @UploadedFile() file: Express.Multer.File,
    @Body('folder') folder?: string,
  ) {
    if (!file) throw new BadRequestException('No file provided')
    const result = await this.uploadService.uploadVideo(file, resolveFolder(folder))
    return { url: result.url, publicId: result.publicId, bytes: result.bytes, format: result.format }
  }
}
