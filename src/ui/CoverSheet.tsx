// 表紙を選び直すシート。PDF は最初の数ページから選べ、どの本も「題名だけの表紙」にできる。

import { useEffect, useState } from 'react'
import { getFile, isPdfBook, updateBook, type BookMeta } from '../lib/db'
import { t } from '../lib/i18n'
import { closePdf, makeCover, openPdf, renderToCanvas, type PDFDocumentProxy } from '../lib/pdf'
import { epubCoverImage } from '../lib/importer'
import { Icon, toast } from './common'

const CANDIDATES = 12

export function CoverSheet({ book, onDone, onClose }: { book: BookMeta; onDone: (cover: string | undefined) => void; onClose: () => void }) {
  const [thumbs, setThumbs] = useState<(string | null)[]>([])
  const [busy, setBusy] = useState(false)
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null)
  const [epubCover, setEpubCover] = useState<string | null>(null)

  // EPUB は、本に入っている元の表紙に戻せるようにする
  useEffect(() => {
    if (book.kind !== 'epub') return
    let alive = true
    getFile(book.id)
      .then(async (blob) => (blob ? epubCoverImage(await blob.arrayBuffer()) : undefined))
      .then((u) => alive && setEpubCover(u ?? null))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [book])

  // 候補のページを小さく描く。1 枚ずつ描き、描けたものから並べる
  useEffect(() => {
    if (!isPdfBook(book)) return
    let alive = true
    let opened: PDFDocumentProxy | undefined
    ;(async () => {
      const blob = await getFile(book.id)
      if (!blob || !alive) return
      opened = await openPdf(await blob.arrayBuffer())
      if (!alive) return
      setDoc(opened)
      const n = Math.min(CANDIDATES, book.pageCount)
      for (let i = 0; i < n && alive; i++) {
        const url = await renderToCanvas(opened, i, 220)
          .then((c) => {
            const u = c.toDataURL('image/jpeg', 0.7)
            c.width = c.height = 0
            return u
          })
          .catch(() => null)
        if (alive) setThumbs((prev) => [...prev, url])
      }
    })().catch(() => toast(t('ページを読み込めませんでした')))
    return () => {
      alive = false
      closePdf(opened)
    }
  }, [book])

  const save = async (cover: string | undefined) => {
    setBusy(true)
    try {
      await updateBook(book.id, (b) => (b.cover = cover))
      onDone(cover)
    } catch {
      toast(t('表紙を保存できませんでした'))
      setBusy(false)
    }
  }

  const pick = async (i: number) => {
    if (!doc || busy) return
    setBusy(true)
    const cover = await makeCover(doc, i)
    if (cover) await save(cover)
    else {
      toast(t('このページは表紙にできませんでした'))
      setBusy(false)
    }
  }

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet stack" role="dialog" aria-label={t('表紙を変える')}>
        <div className="row">
          <div className="grow" style={{ fontWeight: 700, fontSize: 17 }}>
            {t('表紙を変える')}
          </div>
          <button className="icon-btn" aria-label={t('閉じる')} onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>
        <div className="cover-grid">
          <button className="cover-pick" disabled={busy} onClick={() => save(undefined)} aria-label={t('題名だけの表紙')}>
            <div className="cover" data-text="true">
              <span className="cover-title">{book.title}</span>
            </div>
            <span>{t('題名だけ')}</span>
          </button>
          {epubCover && (
            <button className="cover-pick" disabled={busy} onClick={() => save(epubCover)} aria-label={t('本に入っている表紙')}>
              <div className="cover" style={{ backgroundImage: `url(${epubCover})` }} />
              <span>{t('本の表紙')}</span>
            </button>
          )}
          {isPdfBook(book) &&
            Array.from({ length: Math.min(CANDIDATES, book.pageCount) }, (_, i) => (
              <button key={i} className="cover-pick" disabled={busy || !thumbs[i]} onClick={() => pick(i)} aria-label={t('{n}ページ目を表紙にする', { n: i + 1 })}>
                <div className="cover" style={{ backgroundImage: thumbs[i] ? `url(${thumbs[i]})` : undefined }} />
                <span>{t('p.{n}', { n: i + 1 })}</span>
              </button>
            ))}
        </div>
      </div>
    </>
  )
}
