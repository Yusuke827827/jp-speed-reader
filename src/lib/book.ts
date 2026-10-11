// ページごとの本文を、ページをまたぐ段落も含めて 1 冊分の段落列に組み立てる。
// ページの本文はルビ記法（｜漢字《かんじ》）を含んだまま保存しており、ここで本文とルビに分ける。

// 各段落は「どの文字位置からどのページか」を持つので、
// 高速読書の位置から PDF のページを引ける（逆も可）。

import { parseRuby, type Ruby } from './normalize'

export interface PageEntry {
  pageIndex: number
  text: string
  contFromPrev: boolean
}

export interface Paragraph {
  /** ルビ記法を除いた本文 */
  text: string
  ruby: Ruby[]
  /** [段落内の開始文字位置, ページ番号(0始まり)] の昇順リスト */
  pageMarks: [number, number][]
  /** 1 冊の先頭からの文字位置 */
  globalStart: number
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
  let prevPage = -2
  for (const p of sorted) {
    const parts = p.text.split('\n').map((s) => s.trim()).filter(Boolean)
    if (parts.length === 0) continue
    // 前のページが空でなく、直前のページから続いている場合だけ連結する
    const canJoin = p.contFromPrev && paragraphs.length > 0 && p.pageIndex === prevPage + 1
    parts.forEach((raw, i) => {
      const { text: t, ruby } = parseRuby(raw)
      if (!t) return
      if (i === 0 && canJoin) {
        const last = paragraphs[paragraphs.length - 1]
        const shift = last.text.length
        last.pageMarks.push([shift, p.pageIndex])
        last.text += t
        for (const r of ruby) last.ruby.push({ ...r, start: r.start + shift, end: r.end + shift })
      } else {
        paragraphs.push({ text: t, ruby, pageMarks: [[0, p.pageIndex]], globalStart: 0 })
      }
    })
    prevPage = p.pageIndex
  }
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
