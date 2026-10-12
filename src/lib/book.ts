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
}

export interface Illust {
  page: number
  rect: [number, number, number, number]
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
    if (p.image === 'illust') pending.push({ page: p.pageIndex, rect: p.illustRect ?? [0, 0, 1, 1] })
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

export function globalOffset(book: BookText, pos: TextPosition): number {
  const para = book.paragraphs[pos.para]
  return para ? para.globalStart + pos.offset : 0
}

export function percentAt(book: BookText, pos: TextPosition): number {
  if (book.totalChars === 0) return 0
  return Math.min(100, (globalOffset(book, pos) / book.totalChars) * 100)
}
