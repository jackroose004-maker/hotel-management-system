// Prisma serializes `Decimal` columns (price, priceAdd, subtotal, vatAmount, total,
// unitPrice, etc.) as STRINGS in JSON responses (confirmed directly against the running
// API: {"price": "20", "priceAdd": "5"}), not numbers — even though our TS interfaces in
// api/types.ts declare them as `number`. Arithmetic on these silently does the wrong thing
// instead of crashing in most places (`"20" * 1.05` coerces fine, but `0 + "5"` string-
// concatenates to "05" instead of adding), and `.toFixed()` crashes outright since strings
// don't have that method — which is what actually happened on the item detail screen.
//
// Fix applied at the API boundary: coerce known Decimal-backed fields to real numbers
// immediately after fetch, so everything downstream can trust the `number` types it
// already declares instead of every call site needing to remember to wrap fields in
// Number(...) individually.
export function toNum(value: unknown): number {
  if (typeof value === 'number') return value
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

// Known Decimal-backed field names across orders/bills/payments responses. The bills
// endpoints (active-bills, closed-bills-today, takeaway-today, table bill) return deeply
// nested, loosely-typed shapes (table → tabs → orders → items → modifiers, plus summary/
// combined blocks) where hand-mapping every level would be brittle — walking the object
// tree and coercing by field name is more robust here than by shape.
const DECIMAL_KEYS = new Set(['price', 'priceAdd', 'unitPrice', 'subtotal', 'vatAmount', 'total', 'discountAmount'])

export function deepNormalizeDecimals<T>(value: T): T {
  if (Array.isArray(value)) return value.map(deepNormalizeDecimals) as unknown as T
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = DECIMAL_KEYS.has(k) && (typeof v === 'string' || typeof v === 'number') ? toNum(v) : deepNormalizeDecimals(v)
    }
    return out as T
  }
  return value
}
