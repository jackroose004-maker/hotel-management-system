import { io, Socket } from 'socket.io-client'

let socket: Socket | null = null
let connectedUrl = ''
let connectedToken = ''

const WS_URL = (process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3001')
  .replace(/^ws:\/\//, 'http://')
  .replace(/^wss:\/\//, 'https://')

export function getSocket(token?: string): Socket {
  const tok = token ?? (typeof window !== 'undefined' ? localStorage.getItem('token') ?? '' : '')
  // Reconnect if URL changed or token changed (new login)
  if (!socket || connectedUrl !== WS_URL || connectedToken !== tok) {
    socket?.disconnect()
    socket = io(WS_URL, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 30000,
      timeout: 10000,
      auth: tok ? { token: tok } : undefined,
    })
    connectedUrl = WS_URL
    connectedToken = tok
  }
  return socket
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect()
    socket = null
    connectedUrl = ''
    connectedToken = ''
  }
}
