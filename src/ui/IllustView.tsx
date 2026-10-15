// 高速読書の中で挿絵を表示する。PDF は本ごとに 1 度だけ開き、切り出した画像は使い回す。

import { useEffect, useState } from 'react'
import type { Illust } from '../lib/book'
import { getFile } from '../lib/db'
import { closePdf, openPdf, renderIllust, type PDFDocumentProxy } from '../lib/pdf'
import { t } from '../lib/i18n'

let current: { bookId: string; doc: Promise<PDFDocumentProxy> } | null = null
const images = new Map<string, Promise<string>>()
const MAX_IMAGES = 8

function docFor(bookId: string) {
  if (current?.bookId !== bookId) {
    const old = current
    old?.doc.then(closePdf).catch(() => {})
    images.clear()
    current = {
      bookId,
      doc: (async () => {
        const blob = await getFile(bookId)
        if (!blob) throw new Error(t('元の PDF が見つかりません'))
        return openPdf(await blob.arrayBuffer())
      })(),
    }
  }
  return current.doc
}

/** 挿絵の画像（data URL）を用意する。先読みにも使う */
export function loadIllust(bookId: string, il: Illust): Promise<string> {
  const key = `${bookId}:${il.page}:${il.rect.join(',')}`
  let p = images.get(key)
  if (!p) {
    const longSide = Math.min(1600, Math.round(Math.max(window.innerWidth, window.innerHeight) * (window.devicePixelRatio || 1)))
    p = docFor(bookId).then((doc) => renderIllust(doc, il.page, il.rect, longSide))
    p.catch(() => images.delete(key))
    images.set(key, p)
    // 古いものから捨てて、メモリを使いすぎないようにする
    while (images.size > MAX_IMAGES) images.delete(images.keys().next().value!)
  }
  return p
}

/** 読書画面を離れるときに PDF を閉じる */
export function releaseIllusts() {
  current?.doc.then(closePdf).catch(() => {})
  current = null
  images.clear()
}

export function IllustView({ bookId, illust, note }: { bookId: string; illust: Illust; note: string }) {
  const [state, setState] = useState<{ url?: string; error?: boolean }>({})
  useEffect(() => {
    let alive = true
    setState({})
    loadIllust(bookId, illust)
      .then((url) => alive && setState({ url }))
      .catch(() => alive && setState({ error: true }))
    return () => {
      alive = false
    }
  }, [bookId, illust])
  return (
    <figure className="illust-view">
      {state.url ? (
        <img src={state.url} alt={t('挿絵（{page}ページ）', { page: illust.page + 1 })} />
      ) : (
        <div className="illust-loading">{state.error ? t('挿絵を表示できませんでした') : t('挿絵を読み込んでいます…')}</div>
      )}
      <figcaption>
        {t('挿絵・p.{page}', { page: illust.page + 1 })}
        {note && t('・{note}', { note })}
      </figcaption>
    </figure>
  )
}
