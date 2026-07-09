'use client'
import React, { useState, useEffect, useCallback, useRef } from 'react'
import {
  Mail, Server, User, Link2, Eye, Send, CheckCircle2,
  Loader2, ChevronDown, ChevronRight, ToggleLeft, ToggleRight, X, Plus,
} from 'lucide-react'
import toast from 'react-hot-toast'
import type { Cfg } from './_types'

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1'

interface EmailTemplate {
  id: string
  key: string
  name: string
  subject: string
  fromName: string | null
  replyTo: string | null
  localeEnabled: boolean
  bgColor: string
  cardTheme: 'light' | 'dark'
  footerNote: string | null
  footerNoReply: string | null
  footerNoReplyAr: string | null
  greeting: string | null
  greetingAr: string | null
}

interface SocialLinks {
  instagram?: string; whatsapp?: string; telegram?: string
  tiktok?: string; facebook?: string; twitter?: string
}

interface SmtpConfig {
  smtpHost: string; smtpPort: number; smtpSecure: boolean
  smtpUser: string; smtpPass: string
  emailFromName: string; emailFromAddress: string; emailReplyTo: string
  supportEmail: string; supportPhone: string
  socialLinks: SocialLinks
}

type EmailTab = 'smtp' | 'identity' | 'social' | 'templates'

const TEMPLATE_LABELS: Record<string, { label: string; desc: string }> = {
  booking_confirmation: { label: 'Booking Confirmation', desc: 'Sent when a booking is confirmed — includes PDF ticket.' },
  booking_cancelled:   { label: 'Booking Cancelled',    desc: 'Sent when a booking is cancelled by staff or system.' },
  order_cancelled:     { label: 'Order Cancelled',      desc: 'Sent when a dine-in or pre-order is cancelled.' },
  otp:                 { label: 'Verification Code',    desc: 'One-time code sent during sign-up and login.' },
  welcome:             { label: 'Welcome',              desc: 'Sent when a new customer account is created.' },
}

// Variables available per template — used for chip picker
const TEMPLATE_VARS: Record<string, { var: string; label: string; labelAr: string }[]> = {
  booking_confirmation: [
    { var: '{{restaurantName}}', label: 'Restaurant name',  labelAr: 'اسم المطعم' },
    { var: '{{name}}',           label: 'Guest name',        labelAr: 'اسم الضيف' },
    { var: '{{ref}}',            label: 'Booking ref',       labelAr: 'رقم الحجز' },
    { var: '{{slotDate}}',       label: 'Date',              labelAr: 'التاريخ' },
    { var: '{{slotTime}}',       label: 'Time',              labelAr: 'الوقت' },
  ],
  booking_cancelled: [
    { var: '{{restaurantName}}', label: 'Restaurant name',  labelAr: 'اسم المطعم' },
    { var: '{{name}}',           label: 'Guest name',        labelAr: 'اسم الضيف' },
    { var: '{{ref}}',            label: 'Booking ref',       labelAr: 'رقم الحجز' },
  ],
  order_cancelled: [
    { var: '{{restaurantName}}', label: 'Restaurant name',  labelAr: 'اسم المطعم' },
    { var: '{{name}}',           label: 'Guest name',        labelAr: 'اسم الضيف' },
    { var: '{{ref}}',            label: 'Order ref',         labelAr: 'رقم الطلب' },
  ],
  otp: [
    { var: '{{restaurantName}}', label: 'Restaurant name',  labelAr: 'اسم المطعم' },
    { var: '{{name}}',           label: 'Guest name',        labelAr: 'اسم الضيف' },
  ],
  welcome: [
    { var: '{{restaurantName}}', label: 'Restaurant name',  labelAr: 'اسم المطعم' },
    { var: '{{name}}',           label: 'Guest name',        labelAr: 'اسم الضيف' },
  ],
}

const SOCIAL_KEYS: { key: keyof SocialLinks; label: string; placeholder: string }[] = [
  { key: 'instagram', label: 'Instagram',   placeholder: 'https://instagram.com/yourpage' },
  { key: 'whatsapp',  label: 'WhatsApp',    placeholder: 'https://wa.me/97155XXXXXXX' },
  { key: 'telegram',  label: 'Telegram',    placeholder: 'https://t.me/yourpage' },
  { key: 'tiktok',    label: 'TikTok',      placeholder: 'https://tiktok.com/@yourpage' },
  { key: 'facebook',  label: 'Facebook',    placeholder: 'https://facebook.com/yourpage' },
  { key: 'twitter',   label: 'Twitter / X', placeholder: 'https://x.com/yourpage' },
]

// ─── Small components ─────────────────────────────────────────────────────────

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div>
      <label className="block text-xs font-semibold uppercase tracking-widest mb-1.5" style={{ color: 'var(--text-muted)' }}>{label}</label>
      {children}
      {hint && <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)', opacity: 0.6 }}>{hint}</p>}
    </div>
  )
}

function Input({ value, onChange, placeholder, type = 'text', dir }: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string; dir?: string
}) {
  return (
    <input dir={dir} type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      className="w-full rounded-lg px-3 py-2 text-sm border outline-none transition-all"
      style={{ backgroundColor: 'var(--input-bg)', color: 'var(--text-primary)', borderColor: 'var(--card-border)' }} />
  )
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button onClick={() => onChange(!checked)} className="flex-shrink-0">
      {checked
        ? <ToggleRight size={24} style={{ color: 'var(--brand)' }} />
        : <ToggleLeft size={24} style={{ color: 'var(--text-muted)', opacity: 0.4 }} />}
    </button>
  )
}

// ─── Variable chip picker for subject line ────────────────────────────────────
function SubjectInput({ value, onChange, templateKey }: {
  value: string; onChange: (v: string) => void; templateKey: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const vars = TEMPLATE_VARS[templateKey] ?? []

  function insertVar(v: string) {
    const el = inputRef.current
    if (!el) { onChange(value + v); return }
    const start = el.selectionStart ?? value.length
    const end = el.selectionEnd ?? value.length
    const next = value.slice(0, start) + v + value.slice(end)
    onChange(next)
    // restore cursor after state update
    setTimeout(() => {
      el.focus()
      el.setSelectionRange(start + v.length, start + v.length)
    }, 0)
  }

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="e.g. Your booking at {{restaurantName}} is confirmed"
        className="w-full rounded-lg px-3 py-2 text-sm border outline-none transition-all"
        style={{ backgroundColor: 'var(--input-bg)', color: 'var(--text-primary)', borderColor: 'var(--card-border)' }}
      />
      {vars.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {vars.map(v => (
            <button key={v.var} onClick={() => insertVar(v.var)}
              className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold border transition-all hover:opacity-80"
              style={{ backgroundColor: 'var(--muted-bg)', color: 'var(--brand)', borderColor: 'var(--brand)', opacity: 0.85 }}>
              <Plus size={8} />
              {v.label}
              <span style={{ color: 'var(--text-muted)', opacity: 0.7 }}>· {v.labelAr}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Preview modal ─────────────────────────────────────────────────────────────
function PreviewModal({ templateKey, onClose, token }: { templateKey: string; onClose: () => void; token: string }) {
  const [html, setHtml] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const backdropRef = useRef<HTMLDivElement>(null)
  const info = TEMPLATE_LABELS[templateKey]

  useEffect(() => {
    fetch(`${API}/settings/email/preview/${templateKey}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.text()).then(setHtml)
      .catch(() => setHtml('<p style="padding:20px;color:red">Preview unavailable</p>'))
      .finally(() => setLoading(false))
  }, [templateKey, token])

  // Close on backdrop click
  function onBackdropClick(e: React.MouseEvent) {
    if (e.target === backdropRef.current) onClose()
  }

  async function sendTest() {
    setSending(true)
    try {
      const r = await fetch(`${API}/settings/email/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ templateKey }),
      })
      if (!r.ok) throw new Error('Failed')
      toast.success('Test email sent to your account email')
    } catch { toast.error('Could not send test email') }
    finally { setSending(false) }
  }

  return (
    <div ref={backdropRef} onClick={onBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.75)', padding: '24px' }}>
      <div className="flex flex-col rounded-2xl overflow-hidden shadow-2xl"
        style={{ backgroundColor: 'var(--card-bg)', width: '100%', maxWidth: '680px', height: '88vh' }}>

        {/* Top bar */}
        <div className="flex items-center justify-between px-5 py-3 border-b flex-shrink-0"
          style={{ borderColor: 'var(--card-border)' }}>
          <div className="flex items-center gap-2">
            <Eye size={13} style={{ color: 'var(--brand)' }} />
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              {info?.label ?? templateKey}
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:opacity-70">
            <X size={16} style={{ color: 'var(--text-muted)' }} />
          </button>
        </div>

        {/* iframe — takes all remaining height */}
        <div className="flex-1 overflow-hidden bg-white min-h-0">
          {loading
            ? <div className="flex items-center justify-center h-full">
                <Loader2 size={22} className="animate-spin" style={{ color: 'var(--brand)' }} />
              </div>
            : <iframe srcDoc={html ?? ''} className="w-full h-full border-0"
                title="Email preview" sandbox="allow-same-origin" />}
        </div>

        {/* Bottom bar — send test */}
        <div className="flex items-center justify-between px-5 py-3 border-t flex-shrink-0"
          style={{ borderColor: 'var(--card-border)', backgroundColor: 'var(--card-bg)' }}>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Send a live test to your account email to check rendering.
          </p>
          <button onClick={sendTest} disabled={sending}
            className="flex items-center gap-1.5 text-xs font-semibold text-white px-4 py-2 rounded-lg disabled:opacity-50 transition-all"
            style={{ backgroundColor: 'var(--brand)' }}>
            {sending ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />}
            Send test email
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Template editor row ──────────────────────────────────────────────────────
function TemplateRow({ tpl, token, isOpen, onToggle, onUpdate }: {
  tpl: EmailTemplate; token: string
  isOpen: boolean; onToggle: () => void
  onUpdate: (updated: EmailTemplate) => void
}) {
  const [local, setLocal] = useState<EmailTemplate>(tpl)
  const [saving, setSaving] = useState(false)
  const [preview, setPreview] = useState(false)
  const dirty = JSON.stringify(local) !== JSON.stringify(tpl)
  const info = TEMPLATE_LABELS[tpl.key]

  // Sync when parent updates (after save)
  useEffect(() => { setLocal(tpl) }, [tpl])

  function upd<K extends keyof EmailTemplate>(k: K, v: EmailTemplate[K]) {
    setLocal(p => ({ ...p, [k]: v }))
  }

  async function save() {
    setSaving(true)
    try {
      const r = await fetch(`${API}/settings/email/templates/${tpl.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          subject:         local.subject,
          fromName:        local.fromName   || null,
          replyTo:         local.replyTo    || null,
          localeEnabled:   local.localeEnabled,
          bgColor:         local.bgColor,
          cardTheme:       local.cardTheme,
          footerNote:      local.footerNote      || null,
          footerNoReply:   local.footerNoReply   || null,
          footerNoReplyAr: local.footerNoReplyAr || null,
          greeting:        local.greeting        || null,
          greetingAr:      local.greetingAr      || null,
        }),
      })
      if (!r.ok) throw new Error('Failed')
      const updated = await r.json()
      onUpdate(updated?.data ?? updated)
      toast.success(`${info?.label ?? tpl.key} saved`)
    } catch { toast.error('Could not save template') }
    finally { setSaving(false) }
  }

  return (
    <div className="border-b last:border-0" style={{ borderColor: 'var(--card-border)' }}>

      {/* Header row — click to toggle */}
      <div className="flex items-center gap-3 px-5 py-3.5 cursor-pointer select-none transition-all hover:opacity-80"
        onClick={onToggle}>
        <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: 'var(--brand)' }}>
          <Mail size={12} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{info?.label ?? tpl.key}</p>
          <p className="text-xs truncate" style={{ color: 'var(--text-muted)', opacity: 0.65 }}>{info?.desc}</p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {dirty && !isOpen && (
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: 'var(--brand)' }} />
          )}
          {isOpen
            ? <ChevronDown size={14} style={{ color: 'var(--text-muted)' }} />
            : <ChevronRight size={14} style={{ color: 'var(--text-muted)' }} />}
        </div>
      </div>

      {/* Expanded editor */}
      {isOpen && (
        <div className="px-5 pb-5 border-t" style={{ borderColor: 'var(--card-border)' }}>
          <div className="grid grid-cols-1 gap-4 mt-4">

            {/* Locale toggle only */}
            <div className="flex items-center justify-between p-3 rounded-xl border"
              style={{ borderColor: 'var(--card-border)', backgroundColor: 'var(--muted-bg)' }}>
              <div>
                <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>Locale aware</p>
                <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                  When on, date/time format and footer text use the customer's language (AR/EN)
                </p>
              </div>
              <Toggle checked={local.localeEnabled} onChange={v => upd('localeEnabled', v)} />
            </div>

            {/* Subject with variable chip picker */}
            <Field label="Subject line">
              <SubjectInput value={local.subject} onChange={v => upd('subject', v)} templateKey={tpl.key} />
            </Field>

            {/* From name + reply-to */}
            <div className="grid grid-cols-2 gap-3">
              <Field label="From name" hint="Leave blank to use global from name">
                <Input value={local.fromName ?? ''} onChange={v => upd('fromName', v)} placeholder="e.g. Al Manzil Bookings" />
              </Field>
              <Field label="Reply-to" hint="Leave blank to use global reply-to">
                <Input value={local.replyTo ?? ''} onChange={v => upd('replyTo', v)} placeholder="support@almanzil.com" type="email" />
              </Field>
            </div>

            {/* BG colour + card theme */}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Background colour">
                <div className="flex items-center gap-2">
                  <input type="color" value={local.bgColor} onChange={e => upd('bgColor', e.target.value)}
                    className="w-9 h-9 rounded-lg border cursor-pointer flex-shrink-0 p-0.5"
                    style={{ borderColor: 'var(--card-border)', backgroundColor: 'var(--input-bg)' }} />
                  <Input value={local.bgColor} onChange={v => upd('bgColor', v)} placeholder="#f0f0f0" />
                </div>
              </Field>
              <Field label="Card theme">
                <div className="flex gap-2">
                  {(['light', 'dark'] as const).map(t => (
                    <button key={t} onClick={() => upd('cardTheme', t)}
                      className="flex-1 py-2 rounded-lg text-xs font-semibold border transition-all capitalize"
                      style={local.cardTheme === t
                        ? { backgroundColor: 'var(--brand)', color: 'white', borderColor: 'var(--brand)' }
                        : { backgroundColor: 'var(--muted-bg)', color: 'var(--text-muted)', borderColor: 'var(--card-border)' }}>
                      {t}
                    </button>
                  ))}
                </div>
              </Field>
            </div>

            {/* Footer note */}
            <Field label="Footer note" hint="Small branding line above the no-reply text (optional)">
              <Input value={local.footerNote ?? ''} onChange={v => upd('footerNote', v)}
                placeholder="e.g. You're receiving this because you made a reservation with us." />
            </Field>

            {/* No-reply copy — localizable */}
            <div className="border-t pt-4" style={{ borderColor: 'var(--card-border)' }}>
              <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--text-muted)' }}>
                Automated footer line
              </p>
              <div className="grid grid-cols-1 gap-3">
                <Field label="English">
                  <Input value={local.footerNoReply ?? ''}
                    onChange={v => upd('footerNoReply', v)}
                    placeholder="This is an automated message. Please do not reply." />
                </Field>
                <Field label="Arabic (AR)">
                  <Input value={local.footerNoReplyAr ?? ''}
                    onChange={v => upd('footerNoReplyAr', v)}
                    placeholder="هذه رسالة آلية. يرجى عدم الرد عليها."
                    dir="rtl" />
                </Field>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 pt-1">
              <button onClick={() => setPreview(true)}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border transition-all"
                style={{ color: 'var(--text-primary)', borderColor: 'var(--card-border)', backgroundColor: 'var(--muted-bg)' }}>
                <Eye size={12} /> Preview
              </button>
              <div className="flex-1" />
              <button onClick={save} disabled={!dirty || saving}
                className="flex items-center gap-1.5 text-xs font-semibold text-white px-4 py-2 rounded-lg disabled:opacity-40 transition-all"
                style={{ backgroundColor: 'var(--brand)' }}>
                {saving ? <><Loader2 size={12} className="animate-spin" />Saving…</> : <><CheckCircle2 size={12} />Save</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {preview && (
        <PreviewModal templateKey={tpl.key} onClose={() => setPreview(false)} token={token} />
      )}
    </div>
  )
}

// ─── Main EmailSection ─────────────────────────────────────────────────────────
export default function EmailSection({ cfg, set, token }: { cfg: Cfg; set: <K extends keyof Cfg>(k: K, v: Cfg[K]) => void; token: string }) {
  const [tab, setTab] = useState<EmailTab>('smtp')
  const [templates, setTemplates] = useState<EmailTemplate[]>([])
  const [tplLoading, setTplLoading] = useState(true)
  // Only one accordion open at a time — track by template id
  const [openTpl, setOpenTpl] = useState<string | null>(null)

  const [smtp, setSmtp] = useState<SmtpConfig>({
    smtpHost: '', smtpPort: 587, smtpSecure: false,
    smtpUser: '', smtpPass: '',
    emailFromName: '', emailFromAddress: '', emailReplyTo: '',
    supportEmail: '', supportPhone: '', socialLinks: {},
  })
  const [smtpOriginal, setSmtpOriginal] = useState<SmtpConfig | null>(null)
  const [smtpSaving, setSmtpSaving] = useState(false)

  const loadSettings = useCallback(() => {
    fetch(`${API}/settings`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(r => r.json())
      .then(d => {
        const s = d?.data ?? d
        const loaded: SmtpConfig = {
          smtpHost:         s?.smtpHost         ?? '',
          smtpPort:         s?.smtpPort         ?? 587,
          smtpSecure:       s?.smtpSecure       ?? false,
          smtpUser:         s?.smtpUser         ?? '',
          smtpPass:         s?.smtpPass         ?? '',
          emailFromName:    s?.emailFromName    ?? '',
          emailFromAddress: s?.emailFromAddress ?? '',
          emailReplyTo:     s?.emailReplyTo     ?? '',
          supportEmail:     s?.supportEmail     ?? '',
          supportPhone:     s?.supportPhone     ?? '',
          socialLinks:      (s?.socialLinks     ?? {}) as SocialLinks,
        }
        setSmtp(loaded); setSmtpOriginal(loaded)
      }).catch(() => {})
  }, [token])

  const loadTemplates = useCallback(() => {
    setTplLoading(true)
    fetch(`${API}/settings/email/templates`, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(r => r.json())
      .then(d => setTemplates(d?.data ?? d ?? []))
      .catch(() => {})
      .finally(() => setTplLoading(false))
  }, [token])

  useEffect(() => { loadSettings(); loadTemplates() }, [loadSettings, loadTemplates])

  const smtpDirty = smtpOriginal && JSON.stringify(smtp) !== JSON.stringify(smtpOriginal)

  async function saveSmtp() {
    setSmtpSaving(true)
    try {
      const r = await fetch(`${API}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(smtp),
      })
      if (!r.ok) throw new Error('Failed')
      setSmtpOriginal({ ...smtp })
      toast.success('Email settings saved')
    } catch { toast.error('Could not save') }
    finally { setSmtpSaving(false) }
  }

  function setS<K extends keyof SmtpConfig>(k: K, v: SmtpConfig[K]) {
    setSmtp(p => ({ ...p, [k]: v }))
  }

  const TABS: { id: EmailTab; label: string; icon: React.ElementType }[] = [
    { id: 'smtp',      label: 'SMTP',      icon: Server },
    { id: 'identity',  label: 'Identity',  icon: User },
    { id: 'social',    label: 'Social',    icon: Link2 },
    { id: 'templates', label: 'Templates', icon: Mail },
  ]

  const SaveBtn = ({ label }: { label: string }) => (
    <div className="flex justify-end">
      <button onClick={saveSmtp} disabled={!smtpDirty || smtpSaving}
        className="flex items-center gap-1.5 text-xs font-semibold text-white px-4 py-2 rounded-lg disabled:opacity-40"
        style={{ backgroundColor: 'var(--brand)' }}>
        {smtpSaving ? <><Loader2 size={12} className="animate-spin" />Saving…</> : <><CheckCircle2 size={12} />{label}</>}
      </button>
    </div>
  )

  return (
    <div>
      {/* Section header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b" style={{ borderColor: 'var(--card-border)' }}>
        <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'var(--brand)' }}>
          <Mail size={14} className="text-white" />
        </div>
        <div>
          <p className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Email</p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>SMTP connection, sender identity, social links and per-template design</p>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-0.5 px-5 py-3 border-b overflow-x-auto" style={{ borderColor: 'var(--card-border)' }}>
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all flex-shrink-0"
            style={tab === id
              ? { backgroundColor: 'var(--brand)', color: 'white' }
              : { color: 'var(--text-muted)', backgroundColor: 'var(--muted-bg)' }}>
            <Icon size={11} />{label}
          </button>
        ))}
      </div>

      <div className="p-5 space-y-5">

        {/* ── SMTP ── */}
        {tab === 'smtp' && (
          <>
            <div className="p-3 rounded-xl border text-xs" style={{ borderColor: 'var(--card-border)', backgroundColor: 'var(--muted-bg)', color: 'var(--text-muted)' }}>
              Configure your SMTP server so all emails are sent from your own domain.
            </div>
            <div className="grid grid-cols-1 gap-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <Field label="SMTP host">
                    <Input value={smtp.smtpHost} onChange={v => setS('smtpHost', v)} placeholder="smtp.mailgun.org" />
                  </Field>
                </div>
                <Field label="Port">
                  <Input value={String(smtp.smtpPort)} onChange={v => setS('smtpPort', Number(v))} placeholder="587" type="number" />
                </Field>
              </div>
              <Field label="SMTP username">
                <Input value={smtp.smtpUser} onChange={v => setS('smtpUser', v)} placeholder="noreply@almanzil.com" type="email" />
              </Field>
              <Field label="SMTP password" hint="Leave blank to keep existing password.">
                <Input value={smtp.smtpPass} onChange={v => setS('smtpPass', v)} placeholder="••••••••••••" type="password" />
              </Field>
              <div className="flex items-center justify-between p-3 rounded-xl border"
                style={{ borderColor: 'var(--card-border)', backgroundColor: 'var(--muted-bg)' }}>
                <div>
                  <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>TLS / SSL</p>
                  <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Enable for port 465. Port 587 uses STARTTLS — keep off.</p>
                </div>
                <Toggle checked={smtp.smtpSecure} onChange={v => setS('smtpSecure', v)} />
              </div>
            </div>
            <SaveBtn label="Save SMTP" />
          </>
        )}

        {/* ── Identity ── */}
        {tab === 'identity' && (
          <>
            <div className="p-3 rounded-xl border text-xs" style={{ borderColor: 'var(--card-border)', backgroundColor: 'var(--muted-bg)', color: 'var(--text-muted)' }}>
              Global defaults used in all emails. Individual templates can override From Name and Reply-To.
            </div>
            <div className="grid grid-cols-1 gap-4">
              <Field label="From name">
                <Input value={smtp.emailFromName} onChange={v => setS('emailFromName', v)} placeholder="Al Manzil" />
              </Field>
              <Field label="From address" hint="Must be verified in your email provider (e.g. noreply@almanzil.com)">
                <Input value={smtp.emailFromAddress} onChange={v => setS('emailFromAddress', v)} placeholder="noreply@almanzil.com" type="email" />
              </Field>
              <Field label="Reply-to" hint="Where customer replies go — usually your support inbox">
                <Input value={smtp.emailReplyTo} onChange={v => setS('emailReplyTo', v)} placeholder="support@almanzil.com" type="email" />
              </Field>
              <div className="border-t pt-4" style={{ borderColor: 'var(--card-border)' }}>
                <p className="text-[10px] font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--text-muted)' }}>Support contact (shown in email footers)</p>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Support email">
                    <Input value={smtp.supportEmail} onChange={v => setS('supportEmail', v)} placeholder="support@almanzil.com" type="email" />
                  </Field>
                  <Field label="Support phone">
                    <Input value={smtp.supportPhone} onChange={v => setS('supportPhone', v)} placeholder="+971 4 XXX XXXX" />
                  </Field>
                </div>
              </div>
            </div>
            <SaveBtn label="Save identity" />
          </>
        )}

        {/* ── Social ── */}
        {tab === 'social' && (
          <>
            <div className="p-3 rounded-xl border text-xs" style={{ borderColor: 'var(--card-border)', backgroundColor: 'var(--muted-bg)', color: 'var(--text-muted)' }}>
              Social links appear in email footers and on the landing + login pages. Leave blank to hide any platform.
            </div>
            <div className="grid grid-cols-1 gap-4">
              {SOCIAL_KEYS.map(({ key, label, placeholder }) => (
                <Field key={key} label={label}>
                  <Input
                    value={smtp.socialLinks?.[key] ?? ''}
                    onChange={v => setS('socialLinks', { ...smtp.socialLinks, [key]: v || undefined })}
                    placeholder={placeholder} />
                </Field>
              ))}
            </div>
            <SaveBtn label="Save social links" />
          </>
        )}

        {/* ── Templates ── */}
        {tab === 'templates' && (
          <>
            <div className="p-3 rounded-xl border text-xs" style={{ borderColor: 'var(--card-border)', backgroundColor: 'var(--muted-bg)', color: 'var(--text-muted)' }}>
              Customise the subject line, design and copy for each email type. Click a template to expand it.
            </div>

            {tplLoading
              ? <div className="flex justify-center py-8">
                  <Loader2 size={20} className="animate-spin" style={{ color: 'var(--brand)' }} />
                </div>
              : (
                <div className="border rounded-xl overflow-hidden" style={{ borderColor: 'var(--card-border)' }}>
                  {templates.map(tpl => (
                    <TemplateRow
                      key={tpl.id}
                      tpl={tpl}
                      token={token}
                      isOpen={openTpl === tpl.id}
                      onToggle={() => setOpenTpl(prev => prev === tpl.id ? null : tpl.id)}
                      onUpdate={updated => setTemplates(ts => ts.map(t => t.id === updated.id ? updated : t))}
                    />
                  ))}
                </div>
              )}
          </>
        )}

      </div>
    </div>
  )
}
