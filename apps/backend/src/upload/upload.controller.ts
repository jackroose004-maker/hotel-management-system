import {
  Controller, Post, UploadedFile, UseInterceptors, UseGuards,
  BadRequestException, Query,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import { memoryStorage } from 'multer'
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard'
import { UploadService, UploadFolder } from './upload.service'

const VALID_FOLDERS: UploadFolder[] = ['logos', 'menu', 'backgrounds', 'general', 'avatars']

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
    @Query('folder') folder?: string,
  ) {
    if (!file) throw new BadRequestException('No file provided')

    const uploadFolder: UploadFolder =
      VALID_FOLDERS.includes(folder as UploadFolder) ? (folder as UploadFolder) : 'general'

    const result = await this.uploadService.uploadImage(file, uploadFolder)

    return {
      success: true,
      data: {
        url:      result.url,
        publicId: result.publicId,
        width:    result.width,
        height:   result.height,
        bytes:    result.bytes,
        format:   result.format,
      },
    }
  }
}
