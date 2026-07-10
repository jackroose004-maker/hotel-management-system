import { Controller, Post, Patch, Body, Get, Param, UseGuards, Request, Res, Query, Delete, UploadedFile, UseInterceptors, BadRequestException } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import type { Response } from 'express'
import { ConfigService } from '@nestjs/config'
import { FileInterceptor } from '@nestjs/platform-express'
import { memoryStorage } from 'multer'
import { AuthService } from './auth.service'
import { RegisterDto } from './dto/register.dto'
import { LoginDto } from './dto/login.dto'
import { JwtAuthGuard } from './guards/jwt-auth.guard'
import { UploadService } from '../upload/upload.service'

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService, private config: ConfigService, private upload: UploadService) {}

  // Step 1: request OTP (checks email uniqueness + sends code)
  @Get('check-email')
  checkEmail(@Query('email') email: string) {
    return this.auth.checkEmail(email)
  }

  // Step 1: request OTP (checks email uniqueness + sends code)
  @Post('send-otp')
  sendOtp(@Body('email') email: string, @Body('name') name: string) {
    return this.auth.sendOtp(email, name)
  }

  // Step 2: verify OTP + create account
  @Post('register')
  register(@Body() dto: RegisterDto & { otp: string }) {
    return this.auth.register(dto)
  }

  // ── Password reset (3-step: request OTP → verify OTP → set new password) ──

  @Post('forgot-password')
  forgotPassword(@Body('email') email: string) {
    return this.auth.forgotPassword(email)
  }

  @Post('verify-reset-otp')
  verifyResetOtp(@Body('email') email: string, @Body('code') code: string) {
    return this.auth.verifyResetOtp(email, code)
  }

  @Post('reset-password')
  resetPassword(@Body('resetToken') resetToken: string, @Body('password') password: string) {
    return this.auth.resetPassword(resetToken, password)
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto)
  }

  @Post('staff-login')
  staffLogin(@Body() dto: LoginDto) {
    return this.auth.staffLogin(dto)
  }

  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  changePassword(@Request() req, @Body('currentPassword') currentPassword: string, @Body('newPassword') newPassword: string) {
    return this.auth.changePassword(req.user.id, currentPassword, newPassword)
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@Request() req) {
    // Fetch fresh from DB so language and other profile fields are always current
    return this.auth.getMe(req.user.id)
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me')
  updateMe(@Request() req, @Body() body: { name?: string; phone?: string; dietaryTags?: string; notifOrderUpdates?: boolean; notifBookingReminders?: boolean; language?: string }) {
    return this.auth.updateMe(req.user.id, body)
  }

  @UseGuards(JwtAuthGuard)
  @Post('me/avatar')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } }))
  async uploadAvatar(@Request() req, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file provided')
    const result = await this.upload.uploadImage(file, 'avatars')
    return this.auth.updateMe(req.user.id, { avatarUrl: result.url } as any)
  }

  @UseGuards(JwtAuthGuard)
  @Get('favorites')
  getFavorites(@Request() req) {
    return this.auth.getFavorites(req.user.id)
  }

  @UseGuards(JwtAuthGuard)
  @Post('favorites/:menuItemId')
  toggleFavorite(@Request() req, @Param('menuItemId') menuItemId: string) {
    return this.auth.toggleFavorite(req.user.id, menuItemId)
  }

  // Step 1 — redirect user to Google consent screen
  @Get('google')
  @UseGuards(AuthGuard('google'))
  googleLogin(@Query('redirect') _redirect: string) {
    // Passport handles the redirect to Google
  }

  // Step 2 — Google redirects back here with code
  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  googleCallback(@Request() req: any, @Res() res: Response, @Query('state') state: string) {
    const { user, token } = req.user as { user: any; token: string }
    const frontendUrl = this.config.get<string>('FRONTEND_URL') ?? 'http://localhost:3000'

    // Decode redirect from state param (set by frontend before redirect)
    let redirect = '/account'
    try {
      if (state) {
        const parsed = JSON.parse(Buffer.from(state, 'base64').toString())
        redirect = parsed.redirect ?? '/account'
      }
    } catch {}

    const userEncoded = Buffer.from(JSON.stringify(user)).toString('base64')
    res.redirect(`${frontendUrl}/auth/callback?token=${token}&user=${userEncoded}&redirect=${encodeURIComponent(redirect)}`)
  }
}
