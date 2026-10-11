// 画像のページを Tesseract.js で文字認識する。
//
// - 1 ページずつ描画 → 認識 → 保存 を繰り返すので、メモリを使い切らず、
//   途中でアプリが落ちても次回は未処理のページから再開できる。
// - Tesseract.js の本体（worker と wasm）は public/tesseract に同梱している。
// - 日本語の学習データ（jpn / jpn_vert、各数 MB）は初回だけ CDN から取得し、
//   以後はブラウザ内（IndexedDB）にキャッシュされる。本文や画像は外部に送らない。

import { createWorker, PSM, type Worker } from 'tesseract.js'
import { getPages, putPages, updateBook, type BookMeta, type OcrLang, type PageRecord } from './db'
import { closePdf, openPdf, renderToCanvas, type PDFDocumentProxy } from './pdf'
import { getFile } from './db'

const BASE = import.meta.env.BASE_URL

/** 認識用の描画サイズ（長辺の画素数）。文庫 1 ページで本文の文字が 30px 前後になる */
const OCR_LONG_SIDE = 2200

export interface OcrProgress {
  page: number // 処理中のページ（0 始まり）
  done: number
  total: number
  /** 現在ページ内の進み具合 0〜1 */
  pageProgress: number
  status: string
  lang?: OcrLang
}

export async function createOcrWorker(lang: OcrLang, onLog?: (p: number, status: string) => void): Promise<Worker> {
  const worker = await createWorker(lang, 1, {
    workerPath: `${BASE}tesseract/worker.min.js`,
    corePath: `${BASE}tesseract/`,
    workerBlobURL: false,
    logger: (m) => onLog?.(m.progress, m.status),
  })
  await worker.setParameters({
    tessedit_pageseg_mode: lang === 'jpn_vert' ? PSM.SINGLE_BLOCK_VERT_TEXT : PSM.AUTO,
    preserve_interword_spaces: '0',
  })
  return worker
}

/** Tesseract の出力を本文に整える。日本語の文字間の空白を消し、空行で段落を分ける */
export function cleanOcrText(raw: string): { text: string; contFromPrev: boolean } {
  const CJK = '[\\u3000-\\u30FF\\u3400-\\u9FFF\\uFF00-\\uFFEF々〆〇ー]'
  const noSpace = new RegExp(`(${CJK})[ \\t]+(?=${CJK})`, 'g')
  const paras: string[] = []
  let cur = ''
  for (const line of raw.split(/\r?\n/)) {
    const t = line.replace(noSpace, '$1').replace(noSpace, '$1').trim()
    if (!t) {
      if (cur) paras.push(cur)
      cur = ''
      continue
    }
    if (cur && /^[「『（　]/.test(t)) {
      paras.push(cur)
      cur = t
    } else cur += t
  }
  if (cur) paras.push(cur)
  const first = raw.trimStart()
  return { text: paras.join('\n'), contFromPrev: !/^[「『（　]/.test(first) }
}

export interface OcrRun {
  promise: Promise<void>
  cancel: () => void
}

/**
 * OCR が必要なページ（source が empty のもの、または指定ページ）を順に処理する。
 * lang を省略すると、最初のページで縦書き・横書きの両方を試し、信頼度の高い方を使う。
 */
export function runOcr(
  book: BookMeta,
  opts: { lang?: OcrLang; pages?: number[] },
  onProgress: (p: OcrProgress) => void,
): OcrRun {
  let cancelled = false
  let worker: Worker | null = null
  let doc: PDFDocumentProxy | null = null

  const cancel = () => {
    cancelled = true
    worker?.terminate().catch(() => {})
    worker = null
  }

  const promise = (async () => {
    const blob = await getFile(book.id)
    if (!blob) throw new Error('元の PDF が見つかりません。本棚から取り込み直してください。')
    doc = await openPdf(await blob.arrayBuffer())
    const all = await getPages(book.id)
    const targets = opts.pages ?? all.filter((p) => p.source === 'empty').map((p) => p.pageIndex)
    if (targets.length === 0) {
      await updateBook(book.id, (b) => (b.ocr = { ...b.ocr, status: 'done', updatedAt: Date.now() }))
      return
    }
    const total = targets.length
    let done = 0
    let lang = opts.lang ?? book.ocr.lang
    await updateBook(book.id, (b) => {
      b.ocr = { ...b.ocr, status: 'running', target: opts.pages ? b.ocr.target : total, updatedAt: Date.now() }
    })

    const report = (page: number, pageProgress: number, status: string) =>
      onProgress({ page, done, total, pageProgress, status, lang })

    for (const pageIndex of targets) {
      if (cancelled) break
      report(pageIndex, 0, 'ページを画像にしています')
      const canvas = await renderToCanvas(doc, pageIndex, OCR_LONG_SIDE)

      if (!lang) {
        // 縦横の自動判定: 両方で認識して平均信頼度を比べる
        report(pageIndex, 0, '縦書きか横書きかを判定しています（初回は学習データを取得します）')
        const results: { lang: OcrLang; conf: number; text: string }[] = []
        for (const l of ['jpn_vert', 'jpn'] as OcrLang[]) {
          if (cancelled) break
          worker = await createOcrWorker(l, (p, s) => report(pageIndex, p, statusLabel(s)))
          const r = await worker.recognize(canvas)
          results.push({ lang: l, conf: r.data.confidence, text: r.data.text })
          await worker.terminate()
          worker = null
        }
        if (cancelled || results.length < 2) break
        results.sort((a, b) => b.conf - a.conf)
        lang = results[0].lang
        const chosen = lang
        await updateBook(book.id, (b) => (b.ocr.lang = chosen))
        await savePage(book.id, pageIndex, results[0].text, results[0].conf, lang)
      } else {
        worker ??= await createOcrWorker(lang, (p, s) => report(pageIndex, p, statusLabel(s)))
        const r = await worker.recognize(canvas)
        if (cancelled) break
        await savePage(book.id, pageIndex, r.data.text, r.data.confidence, lang)
      }
      canvas.width = canvas.height = 0 // iPhone でキャンバスのメモリを早めに返す
      done++
      await updateBook(book.id, (b) => {
        b.ocr.done = opts.pages ? b.ocr.done : done
        b.ocr.updatedAt = Date.now()
        b.textVersion++
      })
      report(pageIndex, 1, '保存しました')
    }

    const remaining = (await getPages(book.id)).filter((p) => p.source === 'empty').length
    await updateBook(book.id, (b) => {
      b.emptyPages = remaining
      b.ocr.status = cancelled ? 'paused' : remaining === 0 ? 'done' : 'paused'
      b.ocr.updatedAt = Date.now()
    })
  })()
    .catch(async (e) => {
      if (cancelled) return
      const msg = (e as Error)?.message ?? String(e)
      await updateBook(book.id, (b) => {
        b.ocr.status = 'error'
        b.ocr.error = msg
      })
      throw e
    })
    .finally(async () => {
      await (worker as Worker | null)?.terminate().catch(() => {})
      await closePdf(doc as PDFDocumentProxy | null)
    })

  return { promise, cancel }
}

async function savePage(bookId: string, pageIndex: number, raw: string, confidence: number, lang: OcrLang) {
  const { text, contFromPrev } = cleanOcrText(raw)
  const rec: PageRecord = {
    bookId,
    pageIndex,
    text,
    contFromPrev,
    vertical: lang === 'jpn_vert',
    // 白紙ページも処理済みとして残す（'empty' のままだと再開のたびに処理し直す）
    source: 'ocr',
    confidence,
  }
  await putPages([rec])
}

function statusLabel(s: string): string {
  if (s.includes('loading language')) return '日本語の学習データを読み込んでいます'
  if (s.includes('loading tesseract core')) return 'OCR エンジンを読み込んでいます'
  if (s.includes('initializ')) return 'OCR エンジンを準備しています'
  if (s.includes('recognizing')) return '文字を認識しています'
  return s
}
