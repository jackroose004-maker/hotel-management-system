export interface UploadedFile {
  url: string
  publicId?: string
  width?: number
  height?: number
  bytes?: number
  format?: string
}

export interface IStorageProvider {
  upload(buffer: Buffer, options: { folder: string; filename: string; mimeType: string }): Promise<UploadedFile>
  delete(publicId: string): Promise<void>
}

export const STORAGE_PROVIDER = 'STORAGE_PROVIDER'
