// 高速読書の中で挿絵を表示する。PDF は本ごとに 1 度だけ開き、切り出した画像は使い回す。

import { useEffect, useState } from 'react'
import type { Illust } from '../lib/book'
import { getFile } from '../lib/db'
import { epubFile } from '../lib/epub'
import { imageType } from '../lib/importer'
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

// EPUB は本ごとに 1 度だけ読み込み、挿絵の画像はそこから 1 枚ずつ取り出す
let epub: { bookId: string; buf: Promise<ArrayBuffer> } | null = null
const urls = new Set<string>()

function epubImage(bookId: string, path: string): Promise<string> {
  if (epub?.bookId !== bookId) {
    epub = {
      bookId,
      buf: getFile(bookId).then((blob) => {
        if (!blob) throw new Error(t('元の EPUB が見つかりません'))
        return blob.arrayBuffer()
      }),
    }
  }
  return epub.buf.then((buf) => {
    const data = epubFile(buf, path)
    if (!data) throw new Error(t('挿絵を表示できませんでした'))
    const url = URL.createObjectURL(new Blob([data as BlobPart], { type: imageType(path) }))
    urls.add(url)
    return url
  })
}

/** 挿絵の画像（URL）を用意する。先読みにも使う */
export function loadIllust(bookId: string, il: Illust): Promise<string> {
  const key = `${bookId}:${il.page}:${il.src ?? il.rect.join(',')}`
  let p = images.get(key)
  if (!p) {
    const longSide = Math.min(1600, Math.round(Math.max(window.innerWidth, window.innerHeight) * (window.devicePixelRatio || 1)))
    p = il.src ? epubImage(bookId, il.src) : docFor(bookId).then((doc) => renderIllust(doc, il.page, il.rect, longSide))
    p.catch(() => images.delete(key))
    images.set(key, p)
    // 古いものから捨てて、メモリを使いすぎないようにする
    while (images.size > MAX_IMAGES) images.delete(images.keys().next().value!)
  }
  return p
}

/** 読書画面を離れるときに PDF・EPUB を手放す */
export function releaseIllusts() {
  current?.doc.then(closePdf).catch(() => {})
  current = null
  epub = null
  images.clear()
  for (const u of urls) URL.revokeObjectURL(u)
  urls.clear()
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
