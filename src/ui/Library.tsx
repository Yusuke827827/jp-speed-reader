import { useEffect, useState } from 'react'
import { deleteBook, listBooks, listProgress, type BookMeta, type Progress } from '../lib/db'
import { ConfirmDialog, ErrorBox, formatDate, formatDuration, go, Icon, toast } from './common'

export function Library() {
  const [books, setBooks] = useState<BookMeta[] | null>(null)
  const [progress, setProgress] = useState<Map<string, Progress>>(new Map())
  const [error, setError] = useState<string | null>(null)
  const [toDelete, setToDelete] = useState<BookMeta | null>(null)
  const [menu, setMenu] = useState<string | null>(null)

  const load = async () => {
    try {
      const [bs, ps] = await Promise.all([listBooks(), listProgress()])
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
      toast(`「${b.title}」を削除しました`)
      load()
    } catch (e) {
      toast(`削除できませんでした: ${(e as Error).message}`)
    }
  }

  const last = books?.find((b) => progress.has(b.id))

  return (
    <div className="screen">
      <header className="topbar">
        <h1>本棚</h1>
        <button className="icon-btn" aria-label="読書履歴" title="読書履歴" onClick={() => go('/history')}>
          <Icon name="history" />
        </button>
        <button className="icon-btn" aria-label="設定" title="設定" onClick={() => go('/settings')}>
          <Icon name="settings" />
        </button>
        <button className="btn primary" onClick={() => go('/import')}>
          <Icon name="plus" /> PDFを追加
        </button>
      </header>

      {error && (
        <ErrorBox title="本棚を読み込めませんでした">
          {error}
          <br />
          プライベートブラウズでは保存が使えません。通常のタブで開き直してください。
        </ErrorBox>
      )}

      {last && (
        <div className="card row" style={{ marginBottom: 16 }}>
          <div className="grow">
            <div className="small muted">前回の続き</div>
            <div style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{last.title}</div>
            <div className="small muted">
              {progress.get(last.id)!.percent.toFixed(1)}%{last.kind === 'text' ? '' : `・p.${progress.get(last.id)!.page + 1}`}
            </div>
          </div>
          <button className="btn primary" onClick={() => go(`/read/${last.id}`)}>
            <Icon name="play" /> 続きから読む
          </button>
        </div>
      )}

      {books === null ? (
        <p className="muted">読み込み中…</p>
      ) : books.length === 0 ? (
        <div className="empty-state">
          <p style={{ fontSize: 18, fontWeight: 700 }}>本棚は空です</p>
          <p className="muted">日本語の小説PDFやテキスト（青空文庫形式も可）を追加すると、画面中央に短い単位で表示して読めます。</p>
          <button className="btn primary" onClick={() => go('/import')}>
            <Icon name="plus" /> PDFを追加
          </button>
        </div>
      ) : (
        <div className="shelf">
          {books.map((b) => {
            const p = progress.get(b.id)
            const pct = p?.percent ?? 0
            return (
              <article key={b.id} className="card book">
                <button
                  className="cover"
                  style={{ backgroundImage: b.cover ? `url(${b.cover})` : undefined }}
                  data-text={b.kind === 'text' ? 'true' : undefined}
                  aria-label={`${b.title}を開く`}
                  onClick={() => go(b.ocr.status === 'needed' && b.emptyPages === b.pageCount ? `/ocr/${b.id}` : `/read/${b.id}`)}
                >
                  {!b.cover && <span className="cover-title">{b.title}</span>}
                  {b.emptyPages > 0 && <span className="badge">{b.ocr.status === 'error' ? 'OCRエラー' : 'OCR未完了'}</span>}
                </button>
                <div className="grow stack" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <h3 title={b.title}>{b.title}</h3>
                  <div className="progress" aria-label={`読了率 ${pct.toFixed(0)}%`}>
                    <div style={{ width: `${pct}%` }} />
                  </div>
                  <div className="small muted">
                    {b.author ? `${b.author}・` : ''}
                    {pct.toFixed(1)}%{b.kind === 'text' ? '' : p ? `・p.${p.page + 1}/${b.pageCount}` : `・${b.pageCount}ページ`}
                    <br />
                    {p ? `${formatDate(p.lastReadAt)}・計${formatDuration(p.readingMs)}` : '未読'}
                  </div>
                  <div className="row" style={{ marginTop: 'auto' }}>
                    <button className="btn primary small grow" onClick={() => go(`/read/${b.id}`)}>
                      {p ? '続きから' : '読む'}
                    </button>
                    <button className="icon-btn" aria-label="その他の操作" aria-expanded={menu === b.id} onClick={() => setMenu(menu === b.id ? null : b.id)}>
                      <Icon name="more" />
                    </button>
                  </div>
                  {menu === b.id && (
                    <div className="row wrap">
                      {b.kind !== 'text' && (
                        <button className="btn small" onClick={() => go(`/pdf/${b.id}`)}>
                          <Icon name="pdf" /> PDF表示
                        </button>
                      )}
                      {b.emptyPages > 0 && (
                        <button className="btn small" onClick={() => go(`/ocr/${b.id}`)}>
                          <Icon name="scan" /> OCR
                        </button>
                      )}
                      <button className="btn small danger" onClick={() => setToDelete(b)}>
                        <Icon name="trash" /> 削除
                      </button>
                    </div>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      )}

      {toDelete && (
        <ConfirmDialog
          title="本棚から削除しますか？"
          body={
            <>
              「{toDelete.title}」のPDF・抽出した本文・読書位置・しおり・履歴をこの端末から削除します。元に戻せません。
            </>
          }
          confirmLabel="削除する"
          danger
          onConfirm={() => remove(toDelete)}
          onCancel={() => setToDelete(null)}
        />
      )}
    </div>
  )
}
