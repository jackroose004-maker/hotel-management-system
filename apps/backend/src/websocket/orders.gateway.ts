import { WebSocketGateway, WebSocketServer, SubscribeMessage, MessageBody } from '@nestjs/websockets'
import { Server } from 'socket.io'

@WebSocketGateway({ cors: { origin: '*' }, namespace: '/' })
export class OrdersGateway {
  @WebSocketServer()
  server: Server

  emitNewOrder(order: any) {
    this.server.emit('order:new', order)
  }

  emitOrderUpdated(order: any) {
    this.server.emit('order:updated', order)
  }

  emitOrderReady(order: any) {
    this.server.emit('order:ready', order)
  }

  emitOrderHelp(payload: { orderId: string; message: string }) {
    this.server.emit('order:help', payload)
  }

  emitOrderMessage(payload: { orderId: string; message: string; staffName: string }) {
    this.server.emit('order:message', payload)
  }
}
