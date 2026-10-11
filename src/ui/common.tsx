import { useEffect, useState, type ReactNode } from 'react'

// ---------- アイコン（線画の SVG。外部フォントに頼らない） ----------

const paths: Record<string, ReactNode> = {
  back: <path d="M15 5l-7 7 7 7" />,
  play: <path d="M8 5.5v13l11-6.5z" fill="currentColor" stroke="none" />,
  pause: (
    <g fill="currentColor" stroke="none">
      <rect x="6.5" y="5" width="4" height="14" rx="1" />
      <rect x="13.5" y="5" width="4" height="14" rx="1" />
    </g>
  ),
  prev: <path d="M15 6l-6 6 6 6" />,
  next: <path d="M9 6l6 6-6 6" />,
  prevPara: <path d="M18 6l-6 6 6 6M11 6l-6 6 6 6" />,
  nextPara: <path d="M6 6l6 6-6 6M13 6l6 6-6 6" />,
  restart: <path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4" />,
  book: <path d="M5 4h9a4 4 0 0 1 4 4v12H9a4 4 0 0 1-4-4zM5 16a4 4 0 0 1 4-4h9" />,
  pdf: <path d="M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6" />,
  settings: (
    <g>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </g>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  list: <path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />,
  grid: <path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" />,
  search: <path d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4" />,
  bookmark: <path d="M6 3h12v18l-6-4-6 4z" />,
  zoomIn: <path d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4M8 11h6M11 8v6" />,
  zoomOut: <path d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4M8 11h6" />,
  compare: <path d="M4 4h7v16H4zM13 4h7v16h-7zM15 8h3M15 12h3M15 16h3" />,
  history: <path d="M12 7v5l3 2M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4" />,
  trash: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />,
  more: (
    <g fill="currentColor" stroke="none">
      <circle cx="5" cy="12" r="1.8" />
      <circle cx="12" cy="12" r="1.8" />
      <circle cx="19" cy="12" r="1.8" />
    </g>
  ),
  text: <path d="M5 6h14M12 6v13M9 19h6" />,
  scan: <path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4M7 12h10" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  bolt: <path d="M13 3L5 14h6l-1 7 8-11h-6z" />,
  people: <path d="M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM3 20a6 6 0 0 1 12 0M16 11a3 3 0 1 0 0-6M17.5 14.5A5 5 0 0 1 21 19.5" />,
}

export function Icon({ name, className = 'icon' }: { name: keyof typeof paths | string; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  )
}

// ---------- ハッシュによる画面遷移 ----------
// サーバー側の設定なしで静的ホスティングでき、PWA のオフライン起動でも壊れない。

export function useRoute() {
  const [hash, setHash] = useState(() => location.hash.slice(1) || '/')
  useEffect(() => {
    const on = () => setHash(location.hash.slice(1) || '/')
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  const [path, query = ''] = hash.split('?')
  return { parts: path.split('/').filter(Boolean), query: new URLSearchParams(query) }
}

export function go(path: string) {
  location.hash = path
}

// ---------- ダイアログ・トースト ----------

export function ConfirmDialog(props: {
  title: string
  body: ReactNode
  confirmLabel: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && props.onCancel()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [props])
  return (
    <div className="dialog-backdrop" onClick={props.onCancel}>
      <div className="dialog" role="alertdialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2>{props.title}</h2>
        <div className="muted">{props.body}</div>
        <div className="actions">
          <button className="btn" onClick={props.onCancel} autoFocus>
            キャンセル
          </button>
          <button className={`btn ${props.danger ? 'danger' : 'primary'}`} onClick={props.onConfirm}>
            {props.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

let toastSetter: ((s: string | null) => void) | null = null
export function toast(msg: string) {
  toastSetter?.(msg)
}

export function ToastHost() {
  const [msg, setMsg] = useState<string | null>(null)
  useEffect(() => {
    toastSetter = setMsg
    return () => {
      toastSetter = null
    }
  }, [])
  useEffect(() => {
    if (!msg) return
    const t = setTimeout(() => setMsg(null), 2800)
    return () => clearTimeout(t)
  }, [msg])
  return msg ? (
    <div className="toast" role="status">
      {msg}
    </div>
  ) : null
}

export function ErrorBox({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="notice error" role="alert">
      <strong>{title}</strong>
      {children}
    </div>
  )
}

// ---------- 書式 ----------

export function formatDuration(ms: number): string {
  const m = Math.round(ms / 60000)
  if (m < 1) return `${Math.max(0, Math.round(ms / 1000))}秒`
  if (m < 60) return `${m}分`
  return `${Math.floor(m / 60)}時間${m % 60}分`
}

export function formatDate(t: number): string {
  const d = new Date(t)
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  const hm = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
  if (sameDay) return `今日 ${hm}`
  const y = new Date(now)
  y.setDate(now.getDate() - 1)
  if (d.toDateString() === y.toDateString()) return `昨日 ${hm}`
  return `${d.getFullYear() === now.getFullYear() ? '' : d.getFullYear() + '/'}${d.getMonth() + 1}/${d.getDate()} ${hm}`
}

export function formatBytes(n: number): string {
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`
}
