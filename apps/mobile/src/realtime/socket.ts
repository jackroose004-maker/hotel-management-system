import { io, Socket } from 'socket.io-client'
import Constants from 'expo-constants'

const WS_URL = (Constants.expoConfig?.extra?.wsUrl as string | undefined) ?? 'http://localhost:3001'

let socket: Socket | null = null

export function getSocket(): Socket {
  if (!socket) {
    socket = io(WS_URL, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
    })
  }
  return socket
}

export function disconnectSocket() {
  socket?.disconnect()
  socket = null
}
