import AsyncStorage from '@react-native-async-storage/async-storage'

// Mobile equivalent of web's sessionStorage `almanzil_tab_token`. Unlike a browser tab,
// the app has no natural "new session" boundary, so this persists across restarts and is
// only reset by an explicit user action (e.g. scanning a different table's QR).
const TAB_TOKEN_KEY = 'almanzil_tab_token'
const ORDER_IDS_KEY = 'almanzil_order_ids'
const TABLE_ID_KEY = 'almanzil_table_id'

function uuid() {
  // RFC4122-ish v4 UUID, good enough as an opaque session identifier
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

export async function getOrCreateTabToken(): Promise<string> {
  const existing = await AsyncStorage.getItem(TAB_TOKEN_KEY)
  if (existing) return existing
  const token = uuid()
  await AsyncStorage.setItem(TAB_TOKEN_KEY, token)
  return token
}

export async function startNewTableSession(tableId: string) {
  await AsyncStorage.multiSet([
    [TAB_TOKEN_KEY, uuid()],
    [TABLE_ID_KEY, tableId],
    [ORDER_IDS_KEY, JSON.stringify([])],
  ])
}

export async function getActiveTableId(): Promise<string | null> {
  return AsyncStorage.getItem(TABLE_ID_KEY)
}

export async function addGuestOrderId(orderId: string) {
  const ids = await getGuestOrderIds()
  if (!ids.includes(orderId)) {
    await AsyncStorage.setItem(ORDER_IDS_KEY, JSON.stringify([...ids, orderId]))
  }
}

export async function getGuestOrderIds(): Promise<string[]> {
  const raw = await AsyncStorage.getItem(ORDER_IDS_KEY)
  if (!raw) return []
  try {
    return JSON.parse(raw)
  } catch {
    return []
  }
}
