// PDF の取り込み: ファイル保存 → 本文抽出 → ページ保存 → OCR が必要か判定

import { describeStorageError, needsOcr, putBook, putPages, saveFile, deleteBook, type BookMeta, type PageRecord } from './db'
import { linesToPageTexts, type PageLines } from './layout'
import { garbledRatio, visibleLength } from './normalize'
import { closePdf, makeCover, openPdf, pageImageRects, pageInk, pageLines, readOutline, readTitle, PdfLoadError } from './pdf'
import { BLANK_INK, FULL_PAGE, illustrationRect, type Rect } from './illust'
import { decodeText, parseTextBook } from './textImport'

export interface ImportProgress {
  phase: 'reading' | 'extracting' | 'repairing' | 'saving' | 'done'
  done: number
  total: number
}

export interface ImportResult {
  book: BookMeta
  /** 文字化けが疑われるページ数 */
  garbledPages: number
}

/** 本文がこれより少ないページは「テキストなし」（画像のページ）とみなす */
const MIN_PAGE_CHARS = 8

export class ImportError extends Error {
  hint: string
  constructor(message: string, hint: string) {
    super(message)
    this.hint = hint
  }
}

export function newId() {
  return (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`).replace(/-/g, '')
}

export async function importPdf(
  file: File,
  onProgress: (p: ImportProgress) => void,
  signal?: AbortSignal,
): Promise<ImportResult> {
  if (/\.txt$/i.test(file.name) || file.type === 'text/plain') return importText(file, onProgress)
  if (file.type && file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) {
    throw new ImportError('対応していないファイルです。', '小説の PDF（.pdf）か、テキストファイル（.txt、青空文庫形式も可）を選んでください。')
  }
  onProgress({ phase: 'reading', done: 0, total: 1 })
  let buf: ArrayBuffer
  try {
    buf = await file.arrayBuffer()
  } catch {
    throw new ImportError('ファイルを読み込めませんでした。', 'iCloud Drive のファイルは、先に「ファイル」アプリでダウンロードしてから選んでください。')
  }

  let doc
  try {
    doc = await openPdf(buf)
  } catch (e) {
    if (e instanceof PdfLoadError) throw new ImportError(e.message, e.kind === 'password' ? '' : '別の PDF で試すか、元のアプリから PDF を書き出し直してください。')
    throw e
  }

  const id = newId()
  const pageCount = doc.numPages
  const lines: PageLines[] = []
  const rects: Rect[][] = []
  try {
    for (let i = 0; i < pageCount; i++) {
      if (signal?.aborted) throw new DOMException('中止しました', 'AbortError')
      try {
        lines.push(await pageLines(doc, i))
      } catch {
        // 1 ページの失敗で全体を止めない。OCR の対象にする
        lines.push({ lines: [], vertical: false })
      }
      rects.push(await pageImageRects(doc, i).catch(() => []))
      if (i % 4 === 3 || i === pageCount - 1) {
        onProgress({ phase: 'extracting', done: i + 1, total: pageCount })
        await new Promise((r) => setTimeout(r, 0)) // 画面を固めない
      }
    }

    // ToUnicode が空の文字（U+0000）を返すフォントがあれば、ActualText から対応表を直して取り出し直す
    const nulCount = lines.reduce((a, p) => a + p.lines.reduce((b, l) => b + (l.text.split('\u0000').length - 1), 0), 0)
    if (nulCount > 0) {
      onProgress({ phase: 'repairing', done: 0, total: 1 })
      const { fixActualText } = await import('./actualText')
      const fixedPdf = await fixActualText(new Uint8Array(buf)).catch(() => null)
      if (fixedPdf && fixedPdf.fixed > 0) {
        await closePdf(doc)
        buf = fixedPdf.bytes.slice().buffer as ArrayBuffer
        doc = await openPdf(buf)
        for (let i = 0; i < pageCount; i++) {
          lines[i] = await pageLines(doc, i).catch(() => ({ lines: [], vertical: false }))
          if (i % 8 === 7 || i === pageCount - 1) {
            onProgress({ phase: 'repairing', done: i + 1, total: pageCount })
            await new Promise((r) => setTimeout(r, 0))
          }
        }
      }
    }

    const texts = linesToPageTexts(lines)
    let garbledPages = 0
    const pages: PageRecord[] = texts.map((t, i) => {
      const garbled = garbledRatio(t.text) > 0.1
      if (garbled) garbledPages++
      const empty = visibleLength(t.text) < MIN_PAGE_CHARS || garbled
      return {
        bookId: id,
        pageIndex: i,
        text: empty ? '' : t.text,
        contFromPrev: t.contFromPrev,
        vertical: t.vertical,
        source: empty ? 'empty' : 'text',
      }
    })
    await classifyImages(doc, pages, rects)
    const emptyPages = pages.filter(needsOcr).length
    const verticalVotes = pages.filter((p) => p.source === 'text' && p.vertical).length
    const textPages = pages.filter((p) => p.source === 'text').length

    onProgress({ phase: 'saving', done: 0, total: 1 })
    const title = (await readTitle(doc)) ?? file.name.replace(/\.pdf$/i, '')
    const toc = await readOutline(doc).catch(() => [])
    const book: BookMeta = {
      id,
      kind: 'pdf',
      toc,
      title,
      fileName: file.name,
      fileSize: file.size,
      fileModified: file.lastModified,
      pageCount,
      createdAt: Date.now(),
      cover: await makeCover(doc),
      vertical: textPages > 0 ? verticalVotes > textPages / 2 : false,
      emptyPages,
      ocr: {
        status: emptyPages > 0 ? 'needed' : 'none',
        done: 0,
        target: emptyPages,
      },
      textVersion: 1,
    }
    try {
      await saveFile(id, new Blob([buf], { type: 'application/pdf' }))
      await putPages(pages)
      await putBook(book)
    } catch (e) {
      await deleteBook(id).catch(() => {})
      throw new ImportError(describeStorageError(e), '')
    }
    onProgress({ phase: 'done', done: 1, total: 1 })
    return { book, garbledPages }
  } finally {
    await closePdf(doc)
  }
}

/** テキストファイルの取り込み。本文を仮のページに分けて保存する */
async function importText(file: File, onProgress: (p: ImportProgress) => void): Promise<ImportResult> {
  onProgress({ phase: 'reading', done: 0, total: 1 })
  let raw: string
  try {
    raw = decodeText(await file.arrayBuffer())
  } catch {
    throw new ImportError('ファイルを読み込めませんでした。', 'iCloud Drive のファイルは、先に「ファイル」アプリでダウンロードしてから選んでください。')
  }
  const parsed = parseTextBook(raw)
  if (parsed.pages.length === 0 || visibleLength(parsed.pages.join('')) === 0) {
    throw new ImportError('本文が見つかりませんでした。', '空のファイルか、文字コードが UTF-8・Shift_JIS 以外の可能性があります。')
  }
  if (garbledRatio(parsed.pages.join('')) > 0.05) {
    throw new ImportError('文字化けしているようです。', 'UTF-8 か Shift_JIS で保存し直したテキストを選んでください。')
  }
  const id = newId()
  const pages: PageRecord[] = parsed.pages.map((text, i) => ({
    bookId: id,
    pageIndex: i,
    text,
    contFromPrev: false,
    vertical: false,
    source: 'text',
  }))
  const book: BookMeta = {
    id,
    kind: 'text',
    title: parsed.title ?? file.name.replace(/\.txt$/i, ''),
    author: parsed.author,
    toc: parsed.toc,
    fileName: file.name,
    fileSize: file.size,
    fileModified: file.lastModified,
    pageCount: pages.length,
    createdAt: Date.now(),
    vertical: false,
    emptyPages: 0,
    ocr: { status: 'none', done: 0, target: 0 },
    textVersion: 1,
  }
  onProgress({ phase: 'saving', done: 0, total: 1 })
  try {
    await saveFile(id, new Blob([raw], { type: 'text/plain;charset=utf-8' }))
    await putPages(pages)
    await putBook(book)
  } catch (e) {
    await deleteBook(id).catch(() => {})
    throw new ImportError(describeStorageError(e), '')
  }
  onProgress({ phase: 'done', done: 1, total: 1 })
  return { book, garbledPages: 0 }
}

/**
 * 挿絵・白紙のページを見分ける。
 * - 文字の取れないページ: 塗りがほとんど無ければ白紙。本文の多い PDF なら挿絵とみなす。
 *   ほぼ全ページが画像の PDF（スキャン）では、挿絵か本文かを見分けられないので OCR に任せる。
 * - 文字のあるページ: 大きな画像が載っていれば挿絵入りのページ。ただし本文ページの多くに
 *   大きな画像がある PDF は、背景画像とみなして挿絵扱いしない。
 */
async function classifyImages(doc: Awaited<ReturnType<typeof openPdf>>, pages: PageRecord[], rects: Rect[][]) {
  const textPages = pages.filter((p) => p.source === 'text')
  const scanned = textPages.length < pages.length * 0.5
  const withBig = textPages.filter((p) => illustrationRect(rects[p.pageIndex] ?? []))
  const background = textPages.length >= 4 && withBig.length > textPages.length * 0.6
  for (const p of pages) {
    const big = illustrationRect(rects[p.pageIndex] ?? [])
    if (p.source === 'empty') {
      const ink = await pageInk(doc, p.pageIndex).catch(() => 1)
      if (ink < BLANK_INK) p.image = 'blank'
      else if (!scanned) {
        p.image = 'illust'
        p.illustRect = big ?? FULL_PAGE
      }
    } else if (big && !background) {
      p.image = 'illust'
      p.illustRect = big
    }
  }
}
