import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common'
import { Observable } from 'rxjs'
import { map } from 'rxjs/operators'

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(_ctx: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      map(raw => {
        // If the service returns { _data, _message } shape, hoist message to top level
        if (raw && typeof raw === 'object' && '_data' in raw) {
          const { _data, _message, ...rest } = raw
          return { success: true, data: _data, message: _message ?? undefined, ...rest, timestamp: new Date().toISOString() }
        }
        return { success: true, data: raw, timestamp: new Date().toISOString() }
      }),
    )
  }
}
