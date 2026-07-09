import { useEffect, useRef } from 'react'
import { AppState, AppStateStatus } from 'react-native'
import { getSocket } from './socket'
import type { Order } from '../api/types'

interface Options {
  /** Called on order:new / order:updated / order:ready, and again on refetch-on-resume. */
  onEvent: (order: Order) => void
  /** Called when the app returns to foreground — refetch here since backgrounded socket events are lost. */
  onResume?: () => void
}

/**
 * The backend gateway broadcasts globally with no rooms/auth and no event replay
 * (apps/backend/src/websocket/orders.gateway.ts), so any order:* event missed while the
 * app was backgrounded is gone for good. We disconnect on background and force a refetch
 * on foreground instead of trusting a stale/reconnected socket to have caught up.
 */
export function useOrderEvents({ onEvent, onResume }: Options) {
  const appState = useRef(AppState.currentState)

  useEffect(() => {
    const socket = getSocket()
    const handleNew = (order: Order) => onEvent(order)
    const handleUpdated = (order: Order) => onEvent(order)
    const handleReady = (order: Order) => onEvent(order)

    socket.on('order:new', handleNew)
    socket.on('order:updated', handleUpdated)
    socket.on('order:ready', handleReady)
    socket.connect()

    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      if (appState.current.match(/inactive|background/) && next === 'active') {
        socket.connect()
        onResume?.()
      } else if (next.match(/inactive|background/)) {
        socket.disconnect()
      }
      appState.current = next
    })

    return () => {
      socket.off('order:new', handleNew)
      socket.off('order:updated', handleUpdated)
      socket.off('order:ready', handleReady)
      sub.remove()
    }
  }, [onEvent, onResume])
}
