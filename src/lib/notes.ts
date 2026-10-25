// 栞・蛍光マーカー・メモ。本ごとに端末の中（IndexedDB）へ保存する。
// 印には通し番号を振り、あとで別の印を消しても番号は変わらない（番号から文へ飛べるようにするため）。
// 位置は「段落の番号と文字の位置」で持つ。OCR や手の修正で本文がずれたときは、抜き書きで探し直す。

import { useCallback, useEffect, useState } from 'react'
import type { BookText } from './book'
import { getKV, setKV } from './db'
import { splitSentences } from './segment'

export type MarkColor = 'yellow' | 'green' | 'blue' | 'pink'
export const MARK_COLORS: MarkColor[] = ['yellow', 'green', 'blue', 'pink']

export interface Note {
  id: string
  /** 通し番号（1 から） */
  n: number
  para: number
  start: number
  end: number
  /** 栞だけ（色なし）なら undefined */
  color?: MarkColor
  memo: string
  /** 位置を探し直すための抜き書き */
  snippet: string
  page: number
  createdAt: number
}

const key = (bookId: string) => `notes:${bookId}`

/** 位置を含む文の範囲（段落内の [開始, 終了)） */
export function sentenceAt(text: string, offset: number): [number, number] {
  for (const [a, b] of splitSentences(text)) if (offset >= a && offset < b) return [a, b]
  return [0, text.length]
}

/** 本文が変わって位置がずれた印を、抜き書きで探し直す */
export function relocate(book: BookText, notes: Note[]): Note[] {
  return notes.map((n) => {
    const p = book.paragraphs[n.para]
    if (p && p.text.slice(n.start, n.end) === n.snippet) return n
    for (let i = 0; i < book.paragraphs.length; i++) {
      const at = book.paragraphs[i].text.indexOf(n.snippet)
      if (at >= 0) return { ...n, para: i, start: at, end: at + n.snippet.length }
    }
    return n
  })
}

export function useNotes(bookId: string, book: BookText) {
  const [notes, setNotes] = useState<Note[]>([])
  useEffect(() => {
    let alive = true
    getKV<Note[]>(key(bookId))
      .then((xs) => alive && setNotes(relocate(book, xs ?? [])))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [bookId, book])
  const save = useCallback(
    (next: Note[]) => {
      setNotes(next)
      setKV(key(bookId), next).catch(() => {})
    },
    [bookId],
  )
  return [notes, save] as const
}

export function nextNumber(notes: Note[]): number {
  return notes.reduce((m, n) => Math.max(m, n.n), 0) + 1
}

/** 段落ごとのマーカーの範囲（全文パネルで色を付けるため） */
export function marksInParagraph(notes: Note[], para: number): Note[] {
  return notes.filter((n) => n.para === para && n.color)
}
