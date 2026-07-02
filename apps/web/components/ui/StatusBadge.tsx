import React from 'react'

export type StatusVariant =
  | 'pending' | 'accepted' | 'preparing' | 'ready' | 'delivered' | 'cancelled'
  | 'paid' | 'unpaid' | 'partial'
  | 'confirmed' | 'arrived' | 'no_show'
  | 'success' | 'danger' | 'warning' | 'info' | 'neutral'
  | 'empty' | 'occupied' | 'bill_pending' | 'dirty'
  | 'open' | 'closed' | 'voided'

const VARIANT_MAP: Record<StatusVariant, React.CSSProperties> = {
  // Order statuses
  pending:     { backgroundColor: 'var(--c-pending-bg)',  color: 'var(--c-pending-fg)',  border: '1px solid var(--c-pending-bdr)' },
  accepted:    { backgroundColor: 'var(--c-info-bg)',     color: 'var(--c-info-fg)',     border: '1px solid var(--c-info-bdr)' },
  preparing:   { backgroundColor: 'var(--c-warning-bg)',  color: 'var(--c-warning-fg)',  border: '1px solid var(--c-warning-bdr)' },
  ready:       { backgroundColor: 'var(--c-success-bg)',  color: 'var(--c-success-fg)',  border: '1px solid var(--c-success-bdr)' },
  delivered:   { backgroundColor: 'var(--c-neutral-bg)',  color: 'var(--c-neutral-fg)',  border: '1px solid var(--c-neutral-bdr)' },
  cancelled:   { backgroundColor: 'var(--c-danger-bg)',   color: 'var(--c-danger-fg)',   border: '1px solid var(--c-danger-bdr)' },
  // Payment
  paid:        { backgroundColor: 'var(--c-success-bg)',  color: 'var(--c-success-fg)',  border: '1px solid var(--c-success-bdr)' },
  unpaid:      { backgroundColor: 'var(--c-pending-bg)',  color: 'var(--c-pending-fg)',  border: '1px solid var(--c-pending-bdr)' },
  partial:     { backgroundColor: 'var(--c-warning-bg)',  color: 'var(--c-warning-fg)',  border: '1px solid var(--c-warning-bdr)' },
  // Booking
  confirmed:   { backgroundColor: 'var(--c-info-bg)',     color: 'var(--c-info-fg)',     border: '1px solid var(--c-info-bdr)' },
  arrived:     { backgroundColor: 'var(--c-success-bg)',  color: 'var(--c-success-fg)',  border: '1px solid var(--c-success-bdr)' },
  no_show:     { backgroundColor: 'var(--c-danger-bg)',   color: 'var(--c-danger-fg)',   border: '1px solid var(--c-danger-bdr)' },
  // Table
  empty:       { backgroundColor: 'var(--c-success-bg)',  color: 'var(--c-success-fg)',  border: '1px solid var(--c-success-bdr)' },
  occupied:    { backgroundColor: 'var(--c-danger-bg)',   color: 'var(--c-danger-fg)',   border: '1px solid var(--c-danger-bdr)' },
  bill_pending:{ backgroundColor: 'var(--c-pending-bg)',  color: 'var(--c-pending-fg)',  border: '1px solid var(--c-pending-bdr)' },
  dirty:       { backgroundColor: 'var(--c-neutral-bg)',  color: 'var(--c-neutral-fg)',  border: '1px solid var(--c-neutral-bdr)' },
  // Bill
  open:        { backgroundColor: 'var(--c-info-bg)',     color: 'var(--c-info-fg)',     border: '1px solid var(--c-info-bdr)' },
  closed:      { backgroundColor: 'var(--c-success-bg)',  color: 'var(--c-success-fg)',  border: '1px solid var(--c-success-bdr)' },
  voided:      { backgroundColor: 'var(--c-danger-bg)',   color: 'var(--c-danger-fg)',   border: '1px solid var(--c-danger-bdr)' },
  // Generic
  success:     { backgroundColor: 'var(--c-success-bg)',  color: 'var(--c-success-fg)',  border: '1px solid var(--c-success-bdr)' },
  danger:      { backgroundColor: 'var(--c-danger-bg)',   color: 'var(--c-danger-fg)',   border: '1px solid var(--c-danger-bdr)' },
  warning:     { backgroundColor: 'var(--c-warning-bg)',  color: 'var(--c-warning-fg)',  border: '1px solid var(--c-warning-bdr)' },
  info:        { backgroundColor: 'var(--c-info-bg)',     color: 'var(--c-info-fg)',     border: '1px solid var(--c-info-bdr)' },
  neutral:     { backgroundColor: 'var(--c-neutral-bg)',  color: 'var(--c-neutral-fg)',  border: '1px solid var(--c-neutral-bdr)' },
}

export function StatusBadge({
  variant,
  label,
  dot = false,
  size = 'sm',
  className = '',
}: {
  variant: StatusVariant
  label: string
  dot?: boolean
  size?: 'xs' | 'sm' | 'md'
  className?: string
}) {
  const style = VARIANT_MAP[variant] ?? VARIANT_MAP.neutral
  const sizeClass = size === 'xs'
    ? 'text-[9px] px-1.5 py-0.5'
    : size === 'md'
    ? 'text-xs px-2.5 py-1'
    : 'text-[10px] px-2 py-0.5'

  return (
    <span
      style={style}
      className={`inline-flex items-center gap-1 rounded-full font-semibold leading-none whitespace-nowrap ${sizeClass} ${className}`}
    >
      {dot && (
        <span
          className="w-1.5 h-1.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: 'currentColor' }}
        />
      )}
      {label}
    </span>
  )
}

/** Convert raw DB status strings to a StatusVariant */
export function orderStatusVariant(status: string): StatusVariant {
  const map: Record<string, StatusVariant> = {
    PENDING: 'pending', ACCEPTED: 'accepted', PREPARING: 'preparing',
    READY: 'ready', DELIVERED: 'delivered', CANCELLED: 'cancelled',
  }
  return map[status] ?? 'neutral'
}

export function orderStatusLabel(status: string): string {
  const map: Record<string, string> = {
    PENDING: 'Pending', ACCEPTED: 'Accepted', PREPARING: 'Preparing',
    READY: 'Ready', DELIVERED: 'Served', CANCELLED: 'Cancelled',
  }
  return map[status] ?? status
}

export function paymentStatusVariant(status: string): StatusVariant {
  return status === 'PAID' ? 'paid' : status === 'PARTIAL' ? 'partial' : 'unpaid'
}

export function tableStatusVariant(status: string): StatusVariant {
  const map: Record<string, StatusVariant> = {
    EMPTY: 'empty', OCCUPIED: 'occupied', BILL_PENDING: 'bill_pending', DIRTY: 'dirty',
  }
  return map[status] ?? 'neutral'
}

export function bookingStatusVariant(status: string): StatusVariant {
  const map: Record<string, StatusVariant> = {
    PENDING: 'pending', CONFIRMED: 'confirmed', ARRIVED: 'arrived',
    NO_SHOW: 'no_show', CANCELLED: 'cancelled',
  }
  return map[status] ?? 'neutral'
}
