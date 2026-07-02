import { Injectable } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'

@Injectable()
export class OptionalJwtAuthGuard extends AuthGuard('jwt') {
  // Never throw — if no/invalid token, req.user stays undefined
  handleRequest(_err: any, user: any) {
    return user ?? null
  }
}
