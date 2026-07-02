import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Logger } from '@nestjs/common'
import type { Request, Response } from 'express'

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name)

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx      = host.switchToHttp()
    const response = ctx.getResponse<Response>()
    const request  = ctx.getRequest<Request>()

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR
    let message    = 'Internal server error'
    let code       = 'INTERNAL_ERROR'

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus()
      const res  = exception.getResponse()
      message    = typeof res === 'string' ? res : (res as any).message ?? message
      // Map HTTP status to readable code
      code = {
        400: 'BAD_REQUEST',
        401: 'UNAUTHORIZED',
        403: 'FORBIDDEN',
        404: 'NOT_FOUND',
        409: 'CONFLICT',
        422: 'UNPROCESSABLE',
        429: 'TOO_MANY_REQUESTS',
      }[statusCode] ?? 'ERROR'
    } else if (exception instanceof Error) {
      this.logger.error(`Unhandled: ${exception.message}`, exception.stack)
      message = 'Something went wrong. Please try again.'
    }

    // Array validation messages → join into single string
    if (Array.isArray(message)) message = message.join('; ')

    response.status(statusCode).json({
      success: false,
      error: {
        message,
        code,
        statusCode,
        path: request.url,
      },
      timestamp: new Date().toISOString(),
    })
  }
}
