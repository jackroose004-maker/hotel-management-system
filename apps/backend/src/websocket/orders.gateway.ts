import {
  WebSocketGateway, WebSocketServer,
  OnGatewayConnection, OnGatewayDisconnect,
} from '@nestjs/websockets'
import { Server, Socket } from 'socket.io'
import { JwtService } from '@nestjs/jwt'
import { ConfigService } from '@nestjs/config'

@WebSocketGateway({ cors: { origin: '*' }, namespace: '/' })
export class OrdersGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server

  // userId → Set of socketIds currently connected under that user
  private userSockets = new Map<string, Set<string>>()

  constructor(
    private jwt: JwtService,
    private config: ConfigService,
  ) {}

  handleConnection(client: Socket) {
    const token = (client.handshake.auth?.token as string)
      ?? (client.handshake.headers?.authorization as string)?.replace('Bearer ', '')
    if (!token) return

    try {
      const payload = this.jwt.verify(token, { secret: this.config.get('JWT_SECRET') }) as { sub: string }
      const userId = payload.sub
      ;(client as any)._userId = userId
      if (!this.userSockets.has(userId)) this.userSockets.set(userId, new Set())
      this.userSockets.get(userId)!.add(client.id)
    } catch {
      // Invalid token — socket remains anonymous (can still receive order events)
    }
  }

  handleDisconnect(client: Socket) {
    const userId = (client as any)._userId as string | undefined
    if (!userId) return
    const sockets = this.userSockets.get(userId)
    if (sockets) {
      sockets.delete(client.id)
      if (sockets.size === 0) this.userSockets.delete(userId)
    }
  }

  // Called by AuthService after a new login succeeds — kicks all other sessions for userId
  emitForceLogout(userId: string, newSocketId?: string) {
    const sockets = this.userSockets.get(userId)
    if (!sockets) return
    for (const socketId of sockets) {
      if (socketId === newSocketId) continue  // don't kick the new session itself
      this.server.to(socketId).emit('force:logout', { reason: 'new_login' })
    }
  }

  emitNewOrder(order: any) { this.server.emit('order:new', order) }
  emitOrderUpdated(order: any) { this.server.emit('order:updated', order) }
  emitOrderReady(order: any) { this.server.emit('order:ready', order) }
  emitOrderHelp(payload: { orderId: string; message: string }) { this.server.emit('order:help', payload) }
  emitOrderMessage(payload: { orderId: string; message: string; staffName: string }) { this.server.emit('order:message', payload) }
}
