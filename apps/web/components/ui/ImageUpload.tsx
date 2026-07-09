'use client'
import { useRef, useState, useEffect, useCallback } from 'react'
import ReactCrop, { type Crop, centerCrop, makeAspectCrop } from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'
import { Upload, X, Loader2, Image as ImageIcon, Film, Clipboard, CropIcon, Check } from 'lucide-react'
import { uploadImage, uploadVideo } from '@/lib/upload'

interface Props {
  value: string
  onChange: (url: string) => void
  folder: string
  publicId?: string
  label?: string
  hint?: string
  aspectRatio?: 'square' | 'video' | 'free'
  mediaType?: 'image' | 'video' | 'both'
  className?: string
}

// Only square logo gets a locked aspect ratio — menu photos crop freely
const LOCKED_ASPECT: Record<string, number | undefined> = {
  square: 1,
  video: undefined,  // free crop, user decides
  free: undefined,
}

function defaultCrop(): Crop {
  // Start with the full image selected so the user drags IN rather than fighting a tiny box
  return { unit: '%', x: 0, y: 0, width: 100, height: 100 }
}

/** Draw the cropped area onto a canvas and return it as a Blob */
function cropToBlob(img: HTMLImageElement, crop: Crop, mimeType = 'image/jpeg'): Promise<Blob> {
  const scaleX = img.naturalWidth  / img.width
  const scaleY = img.naturalHeight / img.height

  const px = crop.unit === '%'
    ? { x: (crop.x / 100) * img.naturalWidth, y: (crop.y / 100) * img.naturalHeight, w: (crop.width / 100) * img.naturalWidth, h: (crop.height / 100) * img.naturalHeight }
    : { x: crop.x * scaleX, y: crop.y * scaleY, w: crop.width * scaleX, h: crop.height * scaleY }

  const canvas = document.createElement('canvas')
  canvas.width  = px.w
  canvas.height = px.h
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, px.x, px.y, px.w, px.h, 0, 0, px.w, px.h)
  return new Promise((res, rej) => canvas.toBlob(b => b ? res(b) : rej(new Error('canvas empty')), mimeType, 0.92))
}

// ─── Crop modal ───────────────────────────────────────────────────────────────
function CropModal({ src, aspect, onConfirm, onCancel }: {
  src: string
  aspect?: number
  onConfirm: (blob: Blob) => void
  onCancel: () => void
}) {
  const imgRef                      = useRef<HTMLImageElement>(null)
  const [crop, setCrop]             = useState<Crop>(defaultCrop())
  const [confirming, setConfirming] = useState(false)

  const onLoad = useCallback(() => {
    setCrop(defaultCrop())
  }, [])

  const confirm = async () => {
    if (!imgRef.current || !crop) return
    setConfirming(true)
    try {
      const blob = await cropToBlob(imgRef.current, crop)
      onConfirm(blob)
    } finally { setConfirming(false) }
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}
      onClick={onCancel}>
      <div className="flex flex-col rounded-2xl overflow-hidden shadow-2xl w-full max-w-2xl max-h-[92vh]"
        style={{ backgroundColor: 'var(--card-bg)' }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--card-border)]">
          <div className="flex items-center gap-2">
            <CropIcon size={14} style={{ color: 'var(--brand)' }} />
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Crop image</p>
          </div>
          <button onClick={onCancel} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-[var(--muted-bg)] transition-colors"
            style={{ color: 'var(--text-muted)' }}>
            <X size={14} />
          </button>
        </div>

        {/* Crop area */}
        <div className="flex-1 overflow-auto flex items-start justify-center p-5"
          style={{ backgroundColor: '#1a1a1a', backgroundImage: 'repeating-conic-gradient(#2a2a2a 0% 25%, #1a1a1a 0% 50%)', backgroundSize: '20px 20px' }}>
          <ReactCrop
            crop={crop}
            onChange={c => setCrop(c)}
            aspect={aspect}
            minWidth={20}
            minHeight={20}
            keepSelection
            ruleOfThirds>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imgRef}
              src={src}
              alt="crop"
              onLoad={onLoad}
              style={{ maxHeight: '65vh', maxWidth: '100%', display: 'block' }}
            />
          </ReactCrop>
        </div>

        {/* Hint */}
        <p className="text-center text-[11px] py-2 border-b border-[var(--card-border)]" style={{ color: 'var(--text-muted)' }}>
          Drag corners to adjust · {aspect ? `${aspect === 1 ? '1:1' : '16:9'} locked` : 'free crop'}
        </p>

        {/* Footer */}
        <div className="flex gap-2 px-5 py-3.5 border-t border-[var(--card-border)]">
          <button onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl text-sm font-medium border border-[var(--card-border)] transition-colors"
            style={{ color: 'var(--text-muted)', backgroundColor: 'var(--input-bg)' }}>
            Cancel
          </button>
          <button onClick={confirm} disabled={!crop || confirming}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-50 transition-all"
            style={{ backgroundColor: 'var(--brand)' }}>
            {confirming
              ? <><Loader2 size={13} className="animate-spin" />Processing…</>
              : <><Check size={13} />Crop &amp; Upload</>}
          </button>
        </div>
      </div>
    </div>
  )
}

// Module-level flag so only one ImageUpload handles a paste at a time
let pasteHandled = false

// ─── Main component ───────────────────────────────────────────────────────────
export default function ImageUpload({
  value, onChange, folder, publicId, label, hint, aspectRatio = 'free', mediaType = 'image', className = '',
}: Props) {
  const fileRef                   = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [preview, setPreview]     = useState(value)
  const [imgErr, setImgErr]       = useState(false)
  const [pasted, setPasted]       = useState(false)
  // crop modal state
  const [cropSrc, setCropSrc]     = useState<string | null>(null)

  const isVideoUrl = (url: string) => /\.(mp4|webm|mov|ogg)(\?|$)/i.test(url)

  // Sync preview when parent updates value (e.g. settings load from backend)
  useEffect(() => {
    if (!uploading && !cropSrc) {
      setPreview(value)
      setImgErr(false)
    }
  }, [value]) // eslint-disable-line react-hooks/exhaustive-deps

  const aspect = LOCKED_ASPECT[aspectRatio]

  // Upload video directly (no crop step)
  const handleVideoFile = async (file: File) => {
    setUploading(true)
    const local = URL.createObjectURL(file)
    setPreview(local)
    try {
      const url = await uploadVideo(file, folder)
      setPreview(url)
      onChange(url)
    } catch (e: any) {
      setPreview(value)
      alert(e.message ?? 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  // open crop modal instead of uploading directly
  const stageFile = (file: File | Blob) => {
    const type = (file as File).type ?? ''
    if (type.startsWith('video/')) {
      handleVideoFile(file as File)
      return
    }
    if (!type.startsWith('image/') && !(file instanceof Blob)) return
    const url = URL.createObjectURL(file)
    setCropSrc(url)
  }

  // called after user confirms crop
  const handleCroppedBlob = async (blob: Blob) => {
    setCropSrc(null)
    const local = URL.createObjectURL(blob)
    setPreview(local)
    setImgErr(false)
    setUploading(true)
    try {
      // Append timestamp so each upload gets a unique public ID — avoids
      // Cloudinary's overwrite:false rejecting re-uploads and returning the old URL.
      const uniqueId = publicId ? `${publicId}_${Date.now()}` : undefined
      const url = await uploadImage(blob, folder, uniqueId)
      setPreview(url)
      onChange(url)
    } catch (e: any) {
      setPreview(value)
      alert(e.message ?? 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const cancelCrop = () => {
    if (cropSrc) { URL.revokeObjectURL(cropSrc); setCropSrc(null) }
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) stageFile(file)
  }

  // global paste
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (uploading || cropSrc || pasteHandled) return
      const items = Array.from(e.clipboardData?.items ?? [])
      const imgItem = items.find(it => it.type.startsWith('image/'))
      if (!imgItem) return
      const file = imgItem.getAsFile()
      if (file) {
        pasteHandled = true
        setTimeout(() => { pasteHandled = false }, 200)
        setPasted(true); setTimeout(() => setPasted(false), 1200); stageFile(file)
      }
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uploading, cropSrc])

  const clear = (ev: React.MouseEvent) => {
    ev.stopPropagation()
    setPreview('')
    setImgErr(false)
    onChange('')
  }

  const hasImage = !!(preview && !imgErr)

  return (
    <>
      {cropSrc && (
        <CropModal
          src={cropSrc}
          aspect={aspect}
          onConfirm={handleCroppedBlob}
          onCancel={cancelCrop}
        />
      )}

      <div className={className}>
        {label && <p className="text-xs font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>{label}</p>}
        {hint  && <p className="text-[11px] mb-2"           style={{ color: 'var(--text-muted)', opacity: 0.7 }}>{hint}</p>}

        <div
          onClick={!uploading && !cropSrc ? () => fileRef.current?.click() : undefined}
          onDragOver={e => e.preventDefault()}
          onDrop={!uploading && !cropSrc ? onDrop : undefined}
          className={`relative overflow-hidden rounded-xl border-2 border-dashed transition-all cursor-pointer group ${
            pasted
              ? 'border-[var(--brand)]'
              : hasImage
              ? 'border-[var(--brand)]/40'
              : 'border-[var(--card-border)] hover:border-[var(--brand)]/50'
          } ${aspectRatio === 'square' ? 'aspect-square' : aspectRatio === 'video' ? 'aspect-video' : 'min-h-[120px]'}`}
          style={{ backgroundColor: 'var(--muted-bg)' }}>

          {/* Preview */}
          {hasImage && (
            isVideoUrl(preview)
              ? <video src={preview} autoPlay muted loop playsInline
                  className={`w-full h-full ${aspectRatio === 'free' ? 'max-h-48 object-contain p-2' : 'object-cover'}`} />
              // eslint-disable-next-line @next/next/no-img-element
              : <img src={preview} alt="" onError={() => setImgErr(true)}
                  className={`w-full h-full ${aspectRatio === 'free' ? 'max-h-48 object-contain p-2' : 'object-cover'}`} />
          )}

          {/* Empty state */}
          {!hasImage && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'var(--card-border)' }}>
                {mediaType === 'video'
                  ? <Film size={18} style={{ color: 'var(--text-muted)' }} />
                  : mediaType === 'both'
                  ? <div className="flex items-center gap-0.5"><ImageIcon size={13} style={{ color: 'var(--text-muted)' }} /><span style={{ color: 'var(--text-muted)', fontSize: 10 }}>/</span><Film size={13} style={{ color: 'var(--text-muted)' }} /></div>
                  : <ImageIcon size={18} style={{ color: 'var(--text-muted)' }} />}
              </div>
              <div className="text-center">
                <p className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>Click · Drag · or Paste</p>
                <p className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)', opacity: 0.6 }}>
                  {mediaType === 'image' ? 'PNG, JPG, WebP · ⌘V / Ctrl+V'
                    : mediaType === 'video' ? 'MP4, WebM, MOV'
                    : 'Image or Video (MP4, JPG, WebP…)'}
                </p>
              </div>
            </div>
          )}

          {/* Paste flash */}
          {pasted && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none"
              style={{ backgroundColor: 'rgba(0,0,0,0.35)' }}>
              <div className="flex items-center gap-2 text-white text-xs font-bold px-3 py-2 rounded-xl"
                style={{ backgroundColor: 'var(--brand)' }}>
                <Clipboard size={12} /> Pasted — opening crop…
              </div>
            </div>
          )}

          {/* Uploading overlay */}
          {uploading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2"
              style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}>
              <Loader2 size={22} className="animate-spin text-white" />
              <p className="text-xs text-white font-medium">Uploading…</p>
            </div>
          )}

          {/* Hover replace */}
          {hasImage && !uploading && (
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ backgroundColor: 'rgba(0,0,0,0.45)' }}>
              <div className="flex items-center gap-1.5 text-white text-xs font-semibold px-3 py-1.5 rounded-lg"
                style={{ backgroundColor: 'rgba(255,255,255,0.15)' }}>
                <Upload size={12} /> Replace
              </div>
            </div>
          )}

          {/* Clear */}
          {hasImage && !uploading && (
            <button onClick={clear}
              className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center z-10"
              style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
              <X size={11} className="text-white" />
            </button>
          )}
        </div>

        <input
          ref={fileRef}
          type="file"
          accept={mediaType === 'image' ? 'image/*' : mediaType === 'video' ? 'video/*' : 'image/*,video/*'}
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) stageFile(f); e.target.value = '' }}
        />
      </div>
    </>
  )
}
