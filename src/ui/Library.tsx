import { useEffect, useState } from 'react'
import { deleteBook, isPdfBook, listBooks, listProgress, listSessions, type BookMeta, type Progress, type Session } from '../lib/db'
import { GoalChip } from './GoalCard'
import { CoverSheet } from './CoverSheet'
import { Intro } from './Intro'
import { loadSettings, useSettings } from '../lib/settings'
import { ConfirmDialog, ErrorBox, formatDate, formatDuration, go, Icon, toast } from './common'
import { t } from '../lib/i18n'

/** 表紙。画像の無い本は、紙色の地に題名を縦に組んで表紙の代わりにする */
function Cover({ book, className = '' }: { book: BookMeta; className?: string }) {
  return (
    <div className={`cover ${className}`} style={{ backgroundImage: book.cover ? `url(${book.cover})` : undefined }} data-text={book.cover ? undefined : 'true'}>
      {!book.cover && <span className="cover-title">{book.title}</span>}
      {book.emptyPages > 0 && <span className="badge">{book.ocr.status === 'error' ? t('OCRエラー') : t('OCR未完了')}</span>}
    </div>
  )
}

const openPath = (b: BookMeta) => (b.ocr.status === 'needed' && b.emptyPages === b.pageCount ? `/ocr/${b.id}` : `/read/${b.id}`)

export function Library() {
  const [books, setBooks] = useState<BookMeta[] | null>(null)
  const [sessions, setSessions] = useState<Session[]>([])
  const [progress, setProgress] = useState<Map<string, Progress>>(new Map())
  const [error, setError] = useState<string | null>(null)
  const [toDelete, setToDelete] = useState<BookMeta | null>(null)
  const [menu, setMenu] = useState<BookMeta | null>(null)
  const [coverFor, setCoverFor] = useState<BookMeta | null>(null)
  const [, updateSettings] = useSettings()
  const [intro, setIntro] = useState(false)
  // 保存した設定を読み終えてから、案内を出すかを決める（読み込み前の初期値で出してしまわないように）
  useEffect(() => {
    loadSettings().then((s) => setIntro(!s.introSeen))
  }, [])
  const closeIntro = () => {
    setIntro(false)
    updateSettings({ introSeen: true })
  }

  const load = async () => {
    try {
      const [bs, ps, ss] = await Promise.all([listBooks(), listProgress(), listSessions()])
      setSessions(ss)
      const pm = new Map(ps.map((p) => [p.bookId, p]))
      bs.sort((a, b) => (pm.get(b.id)?.lastReadAt ?? b.createdAt) - (pm.get(a.id)?.lastReadAt ?? a.createdAt))
      setBooks(bs)
      setProgress(pm)
    } catch (e) {
      setError((e as Error).message || String(e))
      setBooks([])
    }
  }
  useEffect(() => {
    load()
  }, [])

  const remove = async (b: BookMeta) => {
    setToDelete(null)
    try {
      await deleteBook(b.id)
      toast(t('「{title}」を削除しました', { title: b.title }))
      load()
    } catch (e) {
      toast(t('削除できませんでした: {message}', { message: (e as Error).message }))
    }
  }

  const last = books?.find((b) => progress.has(b.id))
  const lastP = last ? progress.get(last.id) : undefined

  return (
    <div className="screen with-tabs" role="main">
      <header className="topbar" role="none">
        <h1>{t('本棚')}</h1>
        <button className="icon-btn" aria-label={t('本を追加')} title={t('本を追加')} onClick={() => go('/import')}>
          <Icon name="plus" />
        </button>
      </header>

      <GoalChip sessions={sessions} />

      {error && (
        <ErrorBox title={t('本棚を読み込めませんでした')}>
          {error}
          <br />
          {t('プライベートブラウズでは保存が使えません。通常のタブで開き直してください。')}
        </ErrorBox>
      )}

      {last && lastP && (
        <>
          <div className="section-title">{t('前回の続き')}</div>
          <button className="card hero" onClick={() => go(`/read/${last.id}`)} aria-label={t('{title}の続きから読む', { title: last.title })}>
            <Cover book={last} className="hero-cover" />
            <span className="hero-body">
              <span className="hero-title">{last.title}</span>
              {last.author && <span className="hero-author">{last.author}</span>}
              <span className="progress">
                <span style={{ width: `${lastP.percent}%` }} />
              </span>
              <span className="hero-meta">
                {t('{pct}%読了', { pct: lastP.percent.toFixed(0) })}
                {isPdfBook(last) ? t('・p.{page}', { page: lastP.page + 1 }) : ''}
              </span>
              <span className="hero-action">
                <Icon name="play" />
                {t('続きから読む')}
              </span>
            </span>
          </button>
        </>
      )}

      {books === null ? (
        <p className="muted">{t('読み込み中…')}</p>
      ) : books.length === 0 ? (
        <div className="empty-state">
          <p className="empty-title">{t('本棚は空です')}</p>
          <p className="muted">{t('日本語の小説PDFやテキスト（青空文庫形式も可）を追加すると、画面中央に短い単位で表示して読めます。')}</p>
          <button className="btn primary" onClick={() => go('/import')}>
            {t('本を追加')}
          </button>
        </div>
      ) : (
        <>
          <div className="section-title">
            {t('すべての本')}
            <span className="count">{books.length}</span>
          </div>
          <div className="shelf">
            {books.map((b) => {
              const p = progress.get(b.id)
              const pct = p?.percent ?? 0
              return (
                <article key={b.id} className="book">
                  <button className="book-open" aria-label={t('{title}を開く', { title: b.title })} onClick={() => go(openPath(b))}>
                    <Cover book={b} />
                    <span className="book-title">{b.title}</span>
                  </button>
                  <div className="book-foot">
                    <span className={`book-pct${p ? '' : ' unread'}`}>{p ? (pct >= 99.5 ? t('読了') : `${pct.toFixed(0)}%`) : t('未読')}</span>
                    <button className="more-btn" aria-label={t('その他の操作')} onClick={() => setMenu(b)}>
                      <Icon name="more" />
                    </button>
                  </div>
                </article>
              )
            })}
          </div>
        </>
      )}

      {menu && (
        <>
          <div className="sheet-backdrop" onClick={() => setMenu(null)} />
          <div className="sheet action-sheet" role="dialog" aria-label={menu.title}>
            <div className="action-head">
              <Cover book={menu} className="mini-cover" />
              <div className="grow">
                <div className="action-title">{menu.title}</div>
                <div className="small muted">
                  {menu.author ? t('{author}・', { author: menu.author }) : ''}
                  {progress.has(menu.id)
                    ? t('{date}・計{duration}', { date: formatDate(progress.get(menu.id)!.lastReadAt), duration: formatDuration(progress.get(menu.id)!.readingMs) })
                    : t('未読')}
                </div>
              </div>
            </div>
            <ul className="list group">
              <li>
                <button onClick={() => go(`/read/${menu.id}`)}>
                  <Icon name="play" />
                  <span className="grow">{progress.has(menu.id) ? t('続きから読む') : t('読む')}</span>
                </button>
              </li>
              {isPdfBook(menu) && (
                <li>
                  <button onClick={() => go(`/pdf/${menu.id}`)}>
                    <Icon name="pdf" />
                    <span className="grow">{t('PDF表示')}</span>
                  </button>
                </li>
              )}
              <li>
                <button
                  onClick={() => {
                    setCoverFor(menu)
                    setMenu(null)
                  }}
                >
                  <Icon name="grid" />
                  <span className="grow">{t('表紙を変える')}</span>
                </button>
              </li>
              {menu.emptyPages > 0 && (
                <li>
                  <button onClick={() => go(`/ocr/${menu.id}`)}>
                    <Icon name="scan" />
                    <span className="grow">OCR</span>
                  </button>
                </li>
              )}
            </ul>
            <ul className="list group">
              <li>
                <button
                  className="danger"
                  onClick={() => {
                    setToDelete(menu)
                    setMenu(null)
                  }}
                >
                  <Icon name="trash" />
                  <span className="grow">{t('本棚から削除')}</span>
                </button>
              </li>
            </ul>
          </div>
        </>
      )}

      {coverFor && (
        <CoverSheet
          book={coverFor}
          onClose={() => setCoverFor(null)}
          onDone={(cover) => {
            setBooks((bs) => bs && bs.map((b) => (b.id === coverFor.id ? { ...b, cover } : b)))
            setCoverFor(null)
            toast(t('表紙を変えました'))
          }}
        />
      )}

      {intro && <Intro onClose={closeIntro} />}

      {toDelete && (
        <ConfirmDialog
          title={t('本棚から削除しますか？')}
          body={<>{t('「{title}」のPDF・抽出した本文・読書位置・しおり・履歴をこの端末から削除します。元に戻せません。', { title: toDelete.title })}</>}
          confirmLabel={t('削除する')}
          danger
          onConfirm={() => remove(toDelete)}
          onCancel={() => setToDelete(null)}
        />
      )}
    </div>
  )
}
