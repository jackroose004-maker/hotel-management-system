import { apiPost } from './client'

export function settleSession(sessionId: string, method: 'CASH' | 'CARD') {
  return apiPost(`/payments/session/${sessionId}/settle`, { method })
}

export function settleAllCashForTable(tableId: string, method: 'CASH' | 'CARD' = 'CASH') {
  return apiPost(`/payments/table/${tableId}/settle-all-cash`, { method })
}
