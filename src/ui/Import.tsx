import { useEffect, useRef, useState } from 'react'
import { ImportError, importPdf, type ImportProgress } from '../lib/importer'
import { requestPersist, storageInfo } from '../lib/db'
import { ErrorBox, formatBytes, go, Icon } from './common'

const SAMPLES = [
  { file: 'sample-horizontal.pdf', label: '横書きの短編（テキストPDF）' },
  { file: 'sample-vertical.pdf', label: '縦書きの短編（テキストPDF）' },
  { file: 'sample-scanned.pdf', label: '画像だけのPDF（OCRの確認用）' },
  { file: 'sample-illustrated.pdf', label: '挿絵入りのPDF' },
  { file: 'sample-aozora.txt', label: '青空文庫形式のテキスト（ルビ・人物名）' },
]

export function Import() {
  const [progress, setProgress] = useState<ImportProgress | null>(null)
  const [error, setError] = useState<{ title: string; hint: string } | null>(null)
  const [over, setOver] = useState(false)
  const [storage, setStorage] = useState<{ usage: number; quota: number; persisted: boolean } | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const abort = useRef<AbortController | null>(null)

  useEffect(() => {
    storageInfo().then(setStorage).catch(() => {})
    return () => abort.current?.abort()
  }, [])

  const handle = async (file: File) => {
    setError(null)
    abort.current = new AbortController()
    try {
      // 取り込みを機に、ブラウザに保存データを消さないよう依頼する（Safari では許可されない場合がある）
      requestPersist().catch(() => {})
      const { book, garbledPages } = await importPdf(file, setProgress, abort.current.signal)
      if (book.emptyPages > 0) {
        go(`/ocr/${book.id}${garbledPages ? '?garbled=' + garbledPages : ''}`)
      } else {
        go(`/read/${book.id}`)
      }
    } catch (e) {
      setProgress(null)
      if ((e as Error).name === 'AbortError') return
      if (e instanceof ImportError) setError({ title: e.message, hint: e.hint })
      else setError({ title: '取り込み中に問題が起きました。', hint: `${(e as Error)?.message ?? e}。別の PDF で試すか、ページを再読み込みしてください。` })
    }
  }

  const loadSample = async (name: string) => {
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}samples/${name}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const blob = await res.blob()
      const type = name.endsWith('.txt') ? 'text/plain' : 'application/pdf'
      await handle(new File([blob], name, { type, lastModified: Date.now() }))
    } catch (e) {
      setError({ title: 'サンプルを読み込めませんでした。', hint: (e as Error).message })
    }
  }

  const busy = progress !== null && progress.phase !== 'done'
  const pct = progress ? (progress.done / Math.max(1, progress.total)) * 100 : 0

  return (
    <div className="screen">
      <header className="topbar">
        <button className="icon-btn" aria-label="本棚へ戻る" onClick={() => go('/')} disabled={busy}>
          <Icon name="back" />
        </button>
        <h1>本を追加</h1>
      </header>

      <div className="stack">
        <div
          className={`dropzone${over ? ' over' : ''}`}
          onDragOver={(e) => {
            e.preventDefault()
            setOver(true)
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setOver(false)
            const f = e.dataTransfer.files[0]
            if (f && !busy) handle(f)
          }}
        >
          {busy ? (
            <div className="stack" aria-live="polite">
              <div style={{ fontWeight: 700 }}>
                {progress!.phase === 'reading' && 'ファイルを読み込んでいます'}
                {progress!.phase === 'extracting' && `本文を取り出しています（${progress!.done} / ${progress!.total} ページ）`}
                {progress!.phase === 'repairing' && `欠けた文字を補っています（${progress!.done} / ${progress!.total} ページ）`}
                {progress!.phase === 'saving' && '端末に保存しています'}
              </div>
              <div className="progress">
                <div style={{ width: `${progress!.phase === 'extracting' || progress!.phase === 'repairing' ? pct : progress!.phase === 'saving' ? 100 : 5}%` }} />
              </div>
              <button className="btn" onClick={() => abort.current?.abort()}>
                中止
              </button>
            </div>
          ) : (
            <>
              <p style={{ fontSize: 17, fontWeight: 700, margin: '0 0 4px' }}>小説のPDFかテキストを選んでください</p>
              <p className="muted small" style={{ margin: '0 0 16px' }}>
                PCではここにドラッグ＆ドロップもできます。iPhoneでは「ファイル」アプリやiCloud Driveから選べます。
              </p>
              <button className="btn primary" onClick={() => input.current?.click()}>
                <Icon name="plus" /> ファイルを選ぶ
              </button>
              <input
                ref={input}
                type="file"
                accept="application/pdf,.pdf,text/plain,.txt"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  e.target.value = ''
                  if (f) handle(f)
                }}
              />
            </>
          )}
        </div>

        {error && (
          <ErrorBox title={error.title}>
            {error.hint}
          </ErrorBox>
        )}

        <div className="card">
          <div style={{ fontWeight: 700, marginBottom: 6 }}>読み込みの流れ</div>
          <ol className="small muted" style={{ margin: 0, paddingLeft: 20 }}>
            <li>PDFに含まれる文字を取り出し、柱（ページ上部の書名など）・ノンブル・ルビを除いて段落に組み立てます。</li>
            <li>文字が入っていないページ（スキャン画像）は、続けて日本語OCRにかけられます。</li>
            <li>テキスト（.txt）は UTF-8 と Shift_JIS に対応します。青空文庫形式なら題名・著者・見出し・ルビを読み取ります。</li>
            <li>PDFと本文はこの端末のブラウザ内にだけ保存されます。外部のサーバーには送りません。</li>
          </ol>
        </div>

        <div className="card">
          <div style={{ fontWeight: 700, marginBottom: 6 }}>サンプルで試す</div>
          <p className="small muted" style={{ marginTop: 0 }}>このアプリ用に書いた短い文章です。</p>
          <div className="row wrap">
            {SAMPLES.map((s) => (
              <button key={s.file} className="btn small" disabled={busy} onClick={() => loadSample(s.file)}>
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {storage && storage.quota > 0 && (
          <p className="small muted">
            保存容量: {formatBytes(storage.usage)} 使用 / 上限の目安 {formatBytes(storage.quota)}
            {storage.persisted ? '（自動削除されない設定）' : ''}
          </p>
        )}
      </div>
    </div>
  )
}
