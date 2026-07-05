import { Controller, Post, Patch, Body, Get, Param, UseGuards, Request, Res, Query, Delete } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import type { Response } from 'express'
import { ConfigService } from '@nestjs/config'
import { AuthService } from './auth.service'
import { RegisterDto } from './dto/register.dto'
import { LoginDto } from './dto/login.dto'
import { JwtAuthGuard } from './guards/jwt-auth.guard'

@Controller('auth')
export class AuthController {
  constructor(private auth: AuthService, private config: ConfigService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto)
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
  @Get('me')
  me(@Request() req) {
    return req.user
  }

  @UseGuards(JwtAuthGuard)
  @Patch('me')
  updateMe(@Request() req, @Body() body: { name?: string; phone?: string; dietaryTags?: string; notifOrderUpdates?: boolean; notifBookingReminders?: boolean }) {
    return this.auth.updateMe(req.user.id, body)
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
