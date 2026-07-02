import { Injectable } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { Strategy, VerifyCallback } from 'passport-google-oauth20'
import { ConfigService } from '@nestjs/config'
import { AuthService } from '../auth.service'

@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(config: ConfigService, private auth: AuthService) {
    super({
      clientID:            config.get<string>('GOOGLE_CLIENT_ID')!,
      clientSecret:        config.get<string>('GOOGLE_CLIENT_SECRET')!,
      callbackURL:         config.get<string>('GOOGLE_CALLBACK_URL') ?? 'http://localhost:3001/api/v1/auth/google/callback',
      scope:               ['email', 'profile'],
      passReqToCallback:   false,
    })
  }

  async validate(
    _accessToken: string,
    _refreshToken: string,
    profile: any,
    done: VerifyCallback,
  ) {
    const { id, displayName, emails, photos } = profile
    const email = emails?.[0]?.value
    const avatar = photos?.[0]?.value
    const user = await this.auth.findOrCreateGoogleUser({ googleId: id, email, name: displayName, avatar })
    done(null, user)
  }
}
