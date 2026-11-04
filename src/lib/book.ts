// ページごとの本文を、ページをまたぐ段落も含めて 1 冊分の段落列に組み立てる。
// ページの本文はルビ記法（｜漢字《かんじ》）を含んだまま保存しており、ここで本文とルビに分ける。

// 各段落は「どの文字位置からどのページか」を持つので、
// 高速読書の位置から PDF のページを引ける（逆も可）。

import { normalizeChars, parseRuby, type Ruby } from './normalize'

export interface PageEntry {
  pageIndex: number
  text: string
  contFromPrev: boolean
  image?: 'illust' | 'blank'
  illustRect?: [number, number, number, number]
  /** EPUB の挿絵の画像の場所 */
  imagePath?: string
}

export interface Illust {
  page: number
  rect: [number, number, number, number]
  /** EPUB の挿絵なら、EPUB の中の画像の場所（PDF の挿絵はページから切り出す） */
  src?: string
}

export interface Paragraph {
  /** ルビ記法を除いた本文 */
  text: string
  ruby: Ruby[]
  /** [段落内の開始文字位置, ページ番号(0始まり)] の昇順リスト */
  pageMarks: [number, number][]
  /** 1 冊の先頭からの文字位置 */
  globalStart: number
  /** 挿絵を表す段落（本文は空） */
  illust?: Illust
}

export interface BookText {
  paragraphs: Paragraph[]
  totalChars: number
  pageCount: number
}

export interface TextPosition {
  para: number
  offset: number
}

export function buildBookText(pages: PageEntry[], pageCount: number): BookText {
  const paragraphs: Paragraph[] = []
  const sorted = [...pages].sort((a, b) => a.pageIndex - b.pageIndex)
  const illustPages = new Set(sorted.filter((p) => p.image === 'illust').map((p) => p.pageIndex))
  const blankPages = new Set(sorted.filter((p) => p.image === 'blank').map((p) => p.pageIndex))
  // 挿絵は段落を途中で切らないよう、次に新しい段落が始まる位置に差し込む
  let pending: Illust[] = []
  const flush = () => {
    for (const il of pending) paragraphs.push({ text: '', ruby: [], pageMarks: [[0, il.page]], globalStart: 0, illust: il })
    pending = []
  }
  let prevPage = -2
  for (const p of sorted) {
    const parts = p.text.split('\n').map((s) => s.trim()).filter(Boolean)
    if (parts.length > 0) {
      // 直前の本文ページとの間が挿絵・白紙のページだけなら、段落をつなげてよい
      let gapOk = p.pageIndex === prevPage + 1
      if (!gapOk && prevPage >= 0) {
        gapOk = true
        for (let k = prevPage + 1; k < p.pageIndex; k++) if (!illustPages.has(k) && !blankPages.has(k)) gapOk = false
      }
      const last = paragraphs[paragraphs.length - 1]
      const canJoin = p.contFromPrev && gapOk && !!last && !last.illust
      parts.forEach((raw, i) => {
        // 古い版で取り込んだ本文には縦書き用の記号が残っているので、読むときにも直す
      const { text: t, ruby } = parseRuby(normalizeChars(raw))
        if (!t) return
        if (i === 0 && canJoin) {
          const last = paragraphs[paragraphs.length - 1]
          const shift = last.text.length
          last.pageMarks.push([shift, p.pageIndex])
          last.text += t
          for (const r of ruby) last.ruby.push({ ...r, start: r.start + shift, end: r.end + shift })
        } else {
          flush()
          paragraphs.push({ text: t, ruby, pageMarks: [[0, p.pageIndex]], globalStart: 0 })
        }
      })
      prevPage = p.pageIndex
    }
    if (p.image === 'illust') pending.push({ page: p.pageIndex, rect: p.illustRect ?? [0, 0, 1, 1], ...(p.imagePath ? { src: p.imagePath } : {}) })
  }
  flush()
  let pos = 0
  for (const para of paragraphs) {
    para.globalStart = pos
    pos += para.text.length
  }
  return { paragraphs, totalChars: pos, pageCount }
}

export function pageAt(book: BookText, pos: TextPosition): number {
  const para = book.paragraphs[pos.para]
  if (!para) return 0
  let page = para.pageMarks[0][1]
  for (const [off, pg] of para.pageMarks) {
    if (off <= pos.offset) page = pg
    else break
  }
  return page
}

/** 指定ページ以降で最初に始まる本文の位置 */
export function positionForPage(book: BookText, page: number): TextPosition {
  for (let i = 0; i < book.paragraphs.length; i++) {
    for (const [off, pg] of book.paragraphs[i].pageMarks) {
      if (pg >= page) return { para: i, offset: off }
    }
  }
  const last = book.paragraphs.length - 1
  return { para: Math.max(0, last), offset: 0 }
}

/**
 * 目次の見出しの本文上の位置。ページの頭から、前の見出しより後ろで、見出しの文字と同じ（またはそれで始まる）段落を探す。
 * 1 ページに見出しが 2 つある本（テキスト・EPUB の仮のページ）でも、章の境目を正しく取るため。見つからなければページの頭
 */
export function headingPositions(book: BookText, entries: { title: string; page: number }[]): TextPosition[] {
  const norm = (s: string) => s.replace(/[\s　]/g, '')
  let after = 0
  return entries.map((e) => {
    const pagePos = positionForPage(book, e.page)
    const from = Math.max(pagePos.para, after)
    const title = norm(e.title)
    // 同じページの中か、その少し先までを探す（遠くの同じ言葉に飛ばないように）
    for (let i = from; i < Math.min(book.paragraphs.length, from + 200); i++) {
      const tx = norm(book.paragraphs[i].text)
      if (title && (tx === title || (tx.startsWith(title) && tx.length <= title.length + 20))) {
        after = i + 1
        return { para: i, offset: 0 }
      }
    }
    after = Math.max(after, pagePos.para)
    return pagePos
  })
}

/** 読書位置の textVersion がこの値なら、別の端末から移した位置なので、読んだ割合から引き直す */
export const MOVED_TEXT_VERSION = -1

/** 読んだ割合（%）に当たる本文の位置 */
export function positionForPercent(book: BookText, percent: number): TextPosition {
  const target = Math.max(0, Math.min(book.totalChars, (percent / 100) * book.totalChars))
  for (let i = book.paragraphs.length - 1; i >= 0; i--) {
    const p = book.paragraphs[i]
    if (p.globalStart <= target && (p.text.length > 0 || i === 0)) return { para: i, offset: Math.min(p.text.length, Math.round(target - p.globalStart)) }
  }
  return { para: 0, offset: 0 }
}

export function globalOffset(book: BookText, pos: TextPosition): number {
  const para = book.paragraphs[pos.para]
  return para ? para.globalStart + pos.offset : 0
}

export function percentAt(book: BookText, pos: TextPosition): number {
  if (book.totalChars === 0) return 0
  return Math.min(100, (globalOffset(book, pos) / book.totalChars) * 100)
}

/** 前の単位の終わり（prevEnd）から次の単位の始まり（start）までの空白。全文パネルで単位の間に描く */
export function gapBefore(para: Paragraph, prevEnd: number, start: number): string {
  if (start <= prevEnd) return ''
  const gap = para.text.slice(prevEnd, start)
  return /^\s+$/.test(gap) ? gap : ''
}

// 参考文献の見出しと、その後に続く節（付録など）の見出し。論文の番号付き見出し（7. References）も許す
const REFERENCES_HEADING = /^(?:[0-9]+\.?\s*)?(?:references|bibliography|works cited|literature cited|参考文献|引用文献)$/i
const AFTER_REFERENCES = /^(?:[0-9A-Z]+\.?\s*)?(?:appendix|appendices|supplementary|付録)/i

/** 参考文献の段落（見出しから、次の付録などの見出しの手前まで）。速読で飛ばすのに使う */
export function referenceParagraphs(book: BookText): Set<number> {
  const out = new Set<number>()
  let inRefs = false
  book.paragraphs.forEach((p, i) => {
    const t = p.text.trim()
    if (REFERENCES_HEADING.test(t)) inRefs = true
    else if (inRefs && AFTER_REFERENCES.test(t)) inRefs = false
    if (inRefs) out.add(i)
  })
  return out
}
