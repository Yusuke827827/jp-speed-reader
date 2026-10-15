// PDF.js の読み込み・本文抽出・ページ描画。
// iPhone の古めの Safari でも動くよう legacy ビルドを使う。
// 日本語 PDF の表示に必要な CMap と標準フォントは public/pdfjs に同梱する（オフラインで使える）。

import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url'
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist/types/src/display/api'
import { itemsToLines, type PageLines } from './layout'
import { toRawItems } from './pdfItems'
import { imageRects, inkRatio, type Rect } from './illust'
import { t } from './i18n'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

const BASE = import.meta.env.BASE_URL

export type { PDFDocumentProxy, PDFPageProxy }

export class PdfLoadError extends Error {
  kind: 'password' | 'broken' | 'unknown'
  constructor(message: string, kind: 'password' | 'broken' | 'unknown') {
    super(message)
    this.kind = kind
  }
}

/** PDF.js v6 では文書の破棄は読み込みタスク側で行う */
export async function closePdf(doc: PDFDocumentProxy | null | undefined) {
  if (!doc) return
  await doc.loadingTask.destroy().catch(() => {})
}

export async function openPdf(data: ArrayBuffer | Uint8Array): Promise<PDFDocumentProxy> {
  // PDF.js はバッファを worker に移すので、呼び出し側のデータを壊さないようコピーを渡す
  const bytes = data instanceof Uint8Array ? data.slice() : new Uint8Array(data.slice(0))
  try {
    return await pdfjs.getDocument({
      data: bytes,
      cMapUrl: `${BASE}pdfjs/cmaps/`,
      cMapPacked: true,
      standardFontDataUrl: `${BASE}pdfjs/standard_fonts/`,
      wasmUrl: `${BASE}pdfjs/wasm/`,
    }).promise
  } catch (e) {
    const name = (e as { name?: string })?.name
    if (name === 'PasswordException') {
      throw new PdfLoadError(t('パスワードで保護された PDF は読み込めません。保護を外した PDF を用意してください。'), 'password')
    }
    if (name === 'InvalidPDFException' || name === 'FormatError') {
      throw new PdfLoadError(t('PDF が壊れているか、PDF 形式ではありません。別の方法で保存し直した PDF を試してください。'), 'broken')
    }
    throw new PdfLoadError(t('PDF を開けませんでした（{detail}）。', { detail: String((e as Error)?.message ?? e) }), 'unknown')
  }
}

export async function pageLines(doc: PDFDocumentProxy, pageIndex: number): Promise<PageLines> {
  const page = await doc.getPage(pageIndex + 1)
  try {
    const tc = await page.getTextContent()
    return itemsToLines(toRawItems(tc))
  } finally {
    page.cleanup()
  }
}

/** 目次（しおり）を [見出し, ページ番号(0始まり)] に変換する */
export async function readOutline(doc: PDFDocumentProxy): Promise<{ title: string; page: number; depth: number }[]> {
  const outline = await doc.getOutline().catch(() => null)
  if (!outline) return []
  const out: { title: string; page: number; depth: number }[] = []
  const walk = async (nodes: typeof outline, depth: number) => {
    for (const n of nodes) {
      let page = -1
      try {
        const dest = typeof n.dest === 'string' ? await doc.getDestination(n.dest) : n.dest
        if (dest && dest[0]) {
          page = typeof dest[0] === 'number' ? dest[0] : await doc.getPageIndex(dest[0])
        }
      } catch {
        page = -1
      }
      if (page >= 0) out.push({ title: n.title, page, depth })
      if (n.items?.length) await walk(n.items, depth + 1)
    }
  }
  await walk(outline, 0)
  return out
}

export async function readTitle(doc: PDFDocumentProxy): Promise<string | undefined> {
  try {
    const meta = await doc.getMetadata()
    const t = (meta.info as { Title?: string })?.Title?.trim()
    // 「無題」や「Microsoft Word - xxx.docx」のような自動生成の題名は使わない
    if (!t || /^(untitled|無題)/i.test(t) || /\.(docx?|pdf)$/i.test(t)) return undefined
    return t
  } catch {
    return undefined
  }
}

// iPhone の Safari は 1 枚のキャンバスの画素数に上限がある（約 1677 万画素）
export const MAX_CANVAS_PIXELS = 12_000_000

// 同じキャンバスへの描画が重なると PDF.js がエラーを出すため、キャンバスごとに順番に描く
const canvasQueue = new WeakMap<HTMLCanvasElement, Promise<unknown>>()

/** ページをキャンバスに描く。signal で中止すると描画も止める */
export function renderPage(
  doc: PDFDocumentProxy,
  pageIndex: number,
  canvas: HTMLCanvasElement,
  cssWidth: number,
  signal: AbortSignal,
  dpr = window.devicePixelRatio || 1,
): Promise<void> {
  const prev = canvasQueue.get(canvas) ?? Promise.resolve()
  const job = prev
    .catch(() => {})
    .then(async () => {
      if (signal.aborted) return
      const page = await doc.getPage(pageIndex + 1)
      try {
        if (signal.aborted) return
        const base = page.getViewport({ scale: 1 })
        let scale = (cssWidth / base.width) * dpr
        const px = base.width * base.height * scale * scale
        if (px > MAX_CANVAS_PIXELS) scale *= Math.sqrt(MAX_CANVAS_PIXELS / px)
        const viewport = page.getViewport({ scale })
        canvas.width = Math.floor(viewport.width)
        canvas.height = Math.floor(viewport.height)
        canvas.style.width = `${cssWidth}px`
        canvas.style.height = `${(cssWidth * base.height) / base.width}px`
        const task = page.render({ canvas, viewport })
        const onAbort = () => task.cancel()
        signal.addEventListener('abort', onAbort)
        try {
          await task.promise
        } catch (e) {
          if ((e as Error)?.name !== 'RenderingCancelledException') throw e
        } finally {
          signal.removeEventListener('abort', onAbort)
        }
      } finally {
        page.cleanup()
      }
    })
  canvasQueue.set(canvas, job)
  return job
}

/** OCR や表紙用に、指定した長辺の画素数で描画する */
export async function renderToCanvas(doc: PDFDocumentProxy, pageIndex: number, longSide: number) {
  const page = await doc.getPage(pageIndex + 1)
  const base = page.getViewport({ scale: 1 })
  let scale = longSide / Math.max(base.width, base.height)
  const px = base.width * base.height * scale * scale
  if (px > MAX_CANVAS_PIXELS) scale *= Math.sqrt(MAX_CANVAS_PIXELS / px)
  const viewport = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = Math.floor(viewport.width)
  canvas.height = Math.floor(viewport.height)
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  await page.render({ canvas, viewport, background: '#ffffff' }).promise
  page.cleanup()
  return canvas
}

export async function makeCover(doc: PDFDocumentProxy): Promise<string | undefined> {
  try {
    const c = await renderToCanvas(doc, 0, 360)
    const url = c.toDataURL('image/jpeg', 0.72)
    c.width = c.height = 0
    return url
  } catch {
    return undefined
  }
}

/** ページに描かれた画像の範囲（ページに対する割合） */
export async function pageImageRects(doc: PDFDocumentProxy, pageIndex: number): Promise<Rect[]> {
  const page = await doc.getPage(pageIndex + 1)
  try {
    const ops = await page.getOperatorList()
    return imageRects(ops.fnArray, ops.argsArray, pdfjs.OPS, page.view)
  } finally {
    page.cleanup()
  }
}

/** ページを小さく描いて、白でない画素の割合を測る（白紙の判定用） */
export async function pageInk(doc: PDFDocumentProxy, pageIndex: number): Promise<number> {
  const c = await renderToCanvas(doc, pageIndex, 160)
  const ink = inkRatio(c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data)
  c.width = c.height = 0
  return ink
}

/** 挿絵の範囲を切り出して画像（data URL）にする。longSide は切り出した後の長辺の画素数 */
export async function renderIllust(doc: PDFDocumentProxy, pageIndex: number, rect: Rect, longSide: number): Promise<string> {
  const w = rect[2] - rect[0]
  const h = rect[3] - rect[1]
  const page = await renderToCanvas(doc, pageIndex, Math.min(3000, longSide / Math.max(0.1, Math.max(w, h))))
  const sx = Math.floor(rect[0] * page.width)
  const sy = Math.floor(rect[1] * page.height)
  const sw = Math.max(1, Math.floor(w * page.width))
  const sh = Math.max(1, Math.floor(h * page.height))
  const out = document.createElement('canvas')
  out.width = sw
  out.height = sh
  out.getContext('2d')!.drawImage(page, sx, sy, sw, sh, 0, 0, sw, sh)
  const url = out.toDataURL('image/jpeg', 0.85)
  page.width = page.height = out.width = out.height = 0
  return url
}
