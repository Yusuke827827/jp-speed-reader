import { useEffect, useRef, useState } from 'react'
import { ImportError, importPdf, type ImportProgress } from '../lib/importer'
import { requestPersist, storageInfo } from '../lib/db'
import { ErrorBox, formatBytes, go, Icon } from './common'
import { t } from '../lib/i18n'

const SAMPLES = [
  { file: 'sample-horizontal.pdf', label: () => t('横書きの短編（テキストPDF）') },
  { file: 'sample-vertical.pdf', label: () => t('縦書きの短編（テキストPDF）') },
  { file: 'sample-scanned.pdf', label: () => t('画像だけのPDF（OCRの確認用）') },
  { file: 'sample-illustrated.pdf', label: () => t('挿絵入りのPDF') },
  { file: 'sample-aozora.txt', label: () => t('青空文庫形式のテキスト（ルビ・人物名）') },
  { file: 'sample-english-paper.pdf', label: () => t('英語の論文（2段組み・脚注・参考文献）') },
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
      else setError({
          title: t('取り込み中に問題が起きました。'),
          hint: t('{message}。別の PDF で試すか、ページを再読み込みしてください。', { message: String((e as Error)?.message ?? e) }),
        })
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
      setError({ title: t('サンプルを読み込めませんでした。'), hint: (e as Error).message })
    }
  }

  const busy = progress !== null && progress.phase !== 'done'
  const pct = progress ? (progress.done / Math.max(1, progress.total)) * 100 : 0

  return (
    <div className="screen">
      <header className="topbar">
        <button className="icon-btn" aria-label={t('本棚へ戻る')} onClick={() => go('/')} disabled={busy}>
          <Icon name="back" />
        </button>
        <h1>{t('本を追加')}</h1>
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
                {progress!.phase === 'reading' && t('ファイルを読み込んでいます')}
                {progress!.phase === 'extracting' && t('本文を取り出しています（{done} / {total} ページ）', { done: progress!.done, total: progress!.total })}
                {progress!.phase === 'repairing' && t('欠けた文字を補っています（{done} / {total} ページ）', { done: progress!.done, total: progress!.total })}
                {progress!.phase === 'saving' && t('端末に保存しています')}
              </div>
              <div className="progress">
                <div style={{ width: `${progress!.phase === 'extracting' || progress!.phase === 'repairing' ? pct : progress!.phase === 'saving' ? 100 : 5}%` }} />
              </div>
              <button className="btn" onClick={() => abort.current?.abort()}>
                {t('中止')}
              </button>
            </div>
          ) : (
            <>
              <p style={{ fontSize: 17, fontWeight: 700, margin: '0 0 4px' }}>{t('小説のPDFかテキストを選んでください')}</p>
              <p className="muted small" style={{ margin: '0 0 16px' }}>
                {t('PCではここにドラッグ＆ドロップもできます。iPhoneでは「ファイル」アプリやiCloud Driveから選べます。')}
              </p>
              <button className="btn primary" onClick={() => input.current?.click()}>
                <Icon name="plus" /> {t('ファイルを選ぶ')}
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
          <div style={{ fontWeight: 700, marginBottom: 6 }}>{t('読み込みの流れ')}</div>
          <ol className="small muted" style={{ margin: 0, paddingLeft: 20 }}>
            <li>{t('PDFに含まれる文字を取り出し、柱（ページ上部の書名など）・ノンブル・ルビを除いて段落に組み立てます。')}</li>
            <li>{t('文字が入っていないページ（スキャン画像）は、続けて日本語OCRにかけられます。')}</li>
            <li>{t('テキスト（.txt）は UTF-8 と Shift_JIS に対応します。青空文庫形式なら題名・著者・見出し・ルビを読み取ります。')}</li>
            <li>{t('PDFと本文はこの端末のブラウザ内にだけ保存されます。外部のサーバーには送りません。')}</li>
          </ol>
        </div>

        <div className="card">
          <div style={{ fontWeight: 700, marginBottom: 6 }}>{t('サンプルで試す')}</div>
          <p className="small muted" style={{ marginTop: 0 }}>{t('このアプリ用に書いた短い文章です。')}</p>
          <div className="row wrap">
            {SAMPLES.map((s) => (
              <button key={s.file} className="btn small" disabled={busy} onClick={() => loadSample(s.file)}>
                {s.label()}
              </button>
            ))}
          </div>
        </div>

        {storage && storage.quota > 0 && (
          <p className="small muted">
            {t('保存容量: {used} 使用 / 上限の目安 {quota}', { used: formatBytes(storage.usage), quota: formatBytes(storage.quota) })}
            {storage.persisted ? t('（自動削除されない設定）') : ''}
          </p>
        )}
      </div>
    </div>
  )
}
