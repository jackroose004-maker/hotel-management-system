'use client'
import { useState, useCallback, useRef } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle } from 'lucide-react'

interface ConfirmOptions {
  title: string
  message?: string
  confirmLabel?: string
  danger?: boolean
}

interface ConfirmState extends ConfirmOptions {
  resolve: (ok: boolean) => void
}

export function useConfirm() {
  const [state, setState] = useState<ConfirmState | null>(null)

  const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> => {
    return new Promise(resolve => {
      setState({ ...opts, resolve })
    })
  }, [])

  const respond = (ok: boolean) => {
    state?.resolve(ok)
    setState(null)
  }

  const dialog = state && typeof document !== 'undefined'
    ? createPortal(
        <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
          onClick={() => respond(false)}>
          <div className="w-full max-w-xs rounded-2xl overflow-hidden"
            style={{ backgroundColor: 'var(--card-bg)', border: '1px solid var(--card-border)' }}
            onClick={e => e.stopPropagation()}>

            {/* Icon + title */}
            <div className="px-5 pt-5 pb-4 text-center">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto mb-3"
                style={{ backgroundColor: state.danger ? 'rgba(239,68,68,0.1)' : 'rgba(var(--brand-rgb),0.1)' }}>
                <AlertTriangle size={20} style={{ color: state.danger ? '#ef4444' : 'var(--brand)' }} />
              </div>
              <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>{state.title}</p>
              {state.message && (
                <p className="text-xs mt-1.5 leading-relaxed" style={{ color: 'var(--text-muted)' }}>{state.message}</p>
              )}
            </div>

            {/* Actions */}
            <div className="flex border-t" style={{ borderColor: 'var(--card-border)' }}>
              <button onClick={() => respond(false)}
                className="flex-1 py-3 text-sm font-semibold transition-colors border-r"
                style={{ color: 'var(--text-muted)', borderColor: 'var(--card-border)' }}>
                Cancel
              </button>
              <button onClick={() => respond(true)}
                className="flex-1 py-3 text-sm font-bold transition-colors"
                style={{ color: state.danger ? '#ef4444' : 'var(--brand)' }}>
                {state.confirmLabel ?? 'Confirm'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )
    : null

  return { confirm, dialog }
}
