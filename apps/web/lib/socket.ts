import { io, Socket } from 'socket.io-client'

let socket: Socket | null = null
let connectedUrl = ''

const WS_URL = (process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3001')
  .replace(/^ws:\/\//, 'http://')
  .replace(/^wss:\/\//, 'https://')

export function getSocket(): Socket {
  if (!socket || connectedUrl !== WS_URL) {
    socket?.disconnect()
    socket = io(WS_URL, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 30000,
      timeout: 10000,
    })
    connectedUrl = WS_URL
  }
  return socket
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect()
    socket = null
    connectedUrl = ''
  }
}
