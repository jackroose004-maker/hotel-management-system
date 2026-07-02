import { Injectable, NestMiddleware, Logger } from '@nestjs/common'
import { Request, Response, NextFunction } from 'express'

@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  private logger = new Logger('HTTP')

  use(req: Request, res: Response, next: NextFunction) {
    const { method, originalUrl, ip } = req
    const userAgent = req.get('user-agent') ?? ''
    const start = Date.now()

    res.on('finish', () => {
      const { statusCode } = res
      const ms = Date.now() - start
      const color = statusCode >= 500 ? '\x1b[31m' : statusCode >= 400 ? '\x1b[33m' : '\x1b[32m'
      const reset = '\x1b[0m'
      this.logger.log(
        `${color}${method} ${originalUrl} ${statusCode}${reset} +${ms}ms — ${ip} ${userAgent.slice(0, 60)}`,
      )
    })

    next()
  }
}
