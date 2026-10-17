import { useEffect, useRef, useState } from 'react'
import { getBook, getPages, type BookMeta, type OcrLang } from '../lib/db'
import { runOcr, type OcrProgress, type OcrRun } from '../lib/ocr'
import { ErrorBox, go, Icon } from './common'
import { t } from '../lib/i18n'

type LangChoice = 'auto' | OcrLang

export function Ocr({ id, garbled }: { id: string; garbled: number }) {
  const [book, setBook] = useState<BookMeta | null>(null)
  const [textPages, setTextPages] = useState(0)
  const [imagePages, setImagePages] = useState(0)
  const [lang, setLang] = useState<LangChoice>('auto')
  const [progress, setProgress] = useState<OcrProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const run = useRef<OcrRun | null>(null)
  const startedAt = useRef(0)

  const refresh = async () => {
    const b = await getBook(id)
    if (!b) {
      setError(t('この本は見つかりませんでした。'))
      return
    }
    setBook(b)
    if (b.ocr.lang) setLang(b.ocr.lang)
    const ps = await getPages(id)
    setTextPages(ps.filter((p) => p.source !== 'empty' && p.text.trim()).length)
    setImagePages(ps.filter((p) => p.image).length)
  }

  useEffect(() => {
    refresh()
    // 画面を離れたら OCR を止める（処理済みのページは保存されている）
    return () => run.current?.cancel()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // 画面ロック中や別アプリに切り替えた後、Safari は処理を止めることがある。戻ってきたら状態を読み直す
  useEffect(() => {
    const on = () => document.visibilityState === 'visible' && !running && refresh()
    document.addEventListener('visibilitychange', on)
    return () => document.removeEventListener('visibilitychange', on)
  })

  const start = async () => {
    if (!book) return
    setError(null)
    setRunning(true)
    startedAt.current = Date.now()
    // OCR 中に画面が消えないよう、対応ブラウザでは画面のスリープを止める
    const lock = await (navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock
      ?.request('screen')
      .catch(() => undefined)
    const r = runOcr(book, { lang: lang === 'auto' ? undefined : lang }, setProgress)
    run.current = r
    try {
      await r.promise
    } catch (e) {
      setError((e as Error)?.message ?? String(e))
    } finally {
      lock?.release().catch(() => {})
      run.current = null
      setRunning(false)
      await refresh()
    }
  }

  const stop = () => {
    run.current?.cancel()
  }

  if (!book) return <div className="screen">{error ? <ErrorBox title={error} /> : <p className="muted">{t('読み込み中…')}</p>}</div>

  const remaining = book.emptyPages
  const done = progress?.done ?? 0
  const total = progress?.total ?? remaining
  const overall = total ? ((done + (progress?.pageProgress ?? 0)) / total) * 100 : 100
  const elapsed = (Date.now() - startedAt.current) / 1000
  const perPage = done > 0 ? elapsed / done : 0
  const eta = perPage > 0 ? Math.round((perPage * (total - done)) / 60) : null

  return (
    <div className="screen">
      <header className="topbar">
        <button className="icon-btn" aria-label={t('本棚へ戻る')} onClick={() => go('/')}>
          <Icon name="back" />
        </button>
        <h1>{t('文字認識（OCR）')}</h1>
      </header>

      <div className="stack">
        <div className="card">
          <div style={{ fontWeight: 700 }}>{book.title}</div>
          <div className="small muted">
            {t('全{total}ページ・本文のあるページ {text}・挿絵／白紙 {image}・OCRが必要なページ {remaining}', { total: book.pageCount, text: textPages, image: imagePages, remaining })}
          </div>
        </div>

        {garbled > 0 && (
          <div className="notice warn">
            <strong>{t('文字化けしているページがありました（{n}ページ）', { n: garbled })}</strong>
            {t('PDFに埋め込まれた文字の対応表が壊れている可能性があります。それらのページもOCRの対象にしています。')}
          </div>
        )}

        {remaining === 0 && !running ? (
          <div className="notice">
            <strong>{t('OCRが必要なページはありません')}</strong>
            {t('すべてのページから本文を取り出せています。')}
            <div className="row" style={{ marginTop: 10 }}>
              <button className="btn primary" onClick={() => go(`/read/${id}`)}>
                <Icon name="play" /> {t('高速読書を始める')}
              </button>
              <button className="btn" onClick={() => go(`/pdf/${id}?compare=1`)}>
                <Icon name="compare" /> {t('元のページと比べる')}
              </button>
            </div>
          </div>
        ) : (
          <div className="card stack">
            <div className="field">
              <div className="label">{t('本文の向き')}</div>
              <div className="segmented" role="group">
                {(
                  [
                    ['auto', t('自動判定')],
                    ['jpn_vert', t('縦書き')],
                    ['jpn', t('横書き')],
                    ['eng', t('英語')],
                  ] as const
                ).map(([v, l]) => (
                  <button key={v} aria-pressed={lang === v} disabled={running} onClick={() => setLang(v)}>
                    {l}
                  </button>
                ))}
              </div>
              <div className="small muted" style={{ marginTop: 6 }}>
                {t('自動判定では、最初のページを縦書き・横書きの両方で認識し、信頼度の高い方を残りのページに使います。英語が主のページなら、英語としても読み直して比べます。')}
              </div>
            </div>

            {running || progress ? (
              <div className="stack" aria-live="polite">
                <div className="row">
                  <div className="grow" style={{ fontWeight: 700 }}>
                    {running ? t('{done} / {total} ページ', { done, total }) : t('{done}ページを処理しました', { done })}
                  </div>
                  {running && eta !== null && <div className="small muted">{t('残り約{eta}分', { eta })}</div>}
                </div>
                <div className="progress">
                  <div style={{ width: `${overall}%` }} />
                </div>
                {running && progress && (
                  <div className="small muted">
                    {t('p.{page}：{status}', { page: progress.page + 1, status: progress.status })}
                    {progress.lang ? t('（{lang}）', { lang: { jpn_vert: t('縦書き'), jpn: t('横書き'), eng: t('英語') }[progress.lang] }) : ''}
                  </div>
                )}
              </div>
            ) : null}

            <div className="row wrap">
              {running ? (
                <button className="btn" onClick={stop}>
                  {t('中止（処理済みのページは保存されます）')}
                </button>
              ) : (
                <button className="btn primary" onClick={start}>
                  <Icon name="scan" />
                  {book.ocr.status === 'paused' || book.ocr.status === 'error' || book.ocr.done > 0 ? t('続きから再開') : t('OCRを開始')}
                </button>
              )}
              {textPages > 0 && !running && (
                <button className="btn" onClick={() => go(`/read/${id}`)}>
                  {t('読めるページだけ先に読む')}
                </button>
              )}
            </div>

            {error && (
              <ErrorBox title={t('OCRが止まりました')}>
                {error}
                <br />
                {t('ネットワークに初めてつなぐ場面（学習データの取得）で失敗した場合は、接続を確認してから「続きから再開」を押してください。メモリ不足の場合は、他のアプリを閉じてから再開してください。')}
              </ErrorBox>
            )}
            {book.ocr.status === 'error' && !error && book.ocr.error && (
              <ErrorBox title={t('前回のOCRは途中で止まりました')}>{book.ocr.error}</ErrorBox>
            )}
          </div>
        )}

        <div className="card small muted">
          <div style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>{t('OCRについて')}</div>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            <li>{t('認識はこの端末の中で行います。画像や本文は外部に送りません。')}</li>
            <li>{t('初回だけ、使う言語の学習データ（日本語・英語、各数MB）をCDNから取得します。2回目以降はオフラインでも動きます。')}</li>
            <li>{t('1ページずつ保存するため、途中でアプリを閉じても次回は続きから再開できます。')}</li>
            <li>{t('iPhoneでは1ページに数秒〜数十秒かかります。画面をロックすると処理が止まることがあります。')}</li>
            <li>{t('文字がほとんど読み取れないページ（信頼度45%未満、または15字未満）は挿絵とみなし、本文に入れずに読書中に絵として表示します。違っていたら、PDF表示の画面で「本文」に戻せます。')}</li>
            <li>{t('誤認識やルビの混入は避けられません。「PDF表示」の比較画面で元のページと見比べて、本文を直せます。')}</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
