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
    <div className="screen" role="main">
      <header className="topbar" role="none">
        <button className="icon-btn" aria-label={t('本棚へ戻る')} onClick={() => go('/')} disabled={busy}>
          <Icon name="back" />
        </button>
        <h1>{t('本を追加')}</h1>
      </header>

      <div className="stack">
        <div
          className={`card dropzone${over ? ' over' : ''}`}
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
              <div style={{ fontWeight: 600 }}>
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
              <div className="drop-icon" aria-hidden="true">
                <Icon name="fileAdd" />
              </div>
              <button className="btn primary wide" onClick={() => input.current?.click()}>
                {t('ファイルを選ぶ')}
              </button>
              <p className="drop-note">{t('PDF・EPUB・テキスト（.txt）に対応しています。本はこの端末の中だけに保存し、外部には送りません。')}</p>
              <p className="drop-note desktop-only">{t('PCでは、ここにファイルをドラッグ＆ドロップすることもできます。')}</p>
              <input
                ref={input}
                type="file"
                accept="application/pdf,.pdf,application/epub+zip,.epub,text/plain,.txt"
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
      </div>

      <div className="section-title">{t('サンプルで試す')}</div>
      <ul className="list group plain">
        {SAMPLES.map((s) => (
          <li key={s.file}>
            <button disabled={busy} onClick={() => loadSample(s.file)}>
              <span className="grow">{s.label()}</span>
              <Icon name="chevron" className="icon chevron" />
            </button>
          </li>
        ))}
      </ul>
      <p className="section-foot">{t('このアプリ用に書いた短い文章です。')}</p>

      {storage && storage.quota > 0 && (
        <p className="section-foot">
          {t('保存容量: {used} 使用 / 上限の目安 {quota}', { used: formatBytes(storage.usage), quota: formatBytes(storage.quota) })}
          {storage.persisted ? t('（自動削除されない設定）') : ''}
        </p>
      )}
    </div>
  )
}
