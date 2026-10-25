import { describe, expect, it } from 'vitest'
import { buildBookText } from './book'
import { marksInParagraph, nextNumber, relocate, sentenceAt, type Note } from './notes'

// テスト文はこのプロジェクト用に書いたもの
const book = buildBookText([{ pageIndex: 0, text: '雨が上がった。二人は川沿いを歩いた。\n橋の上で立ち止まった。', contFromPrev: false }], 1)
const note = (n: number, para: number, start: number, end: number, snippet: string, color?: Note['color']): Note => ({
  id: String(n), n, para, start, end, color, memo: '', snippet, page: 0, createdAt: 0,
})

describe('栞・マーカー・メモ', () => {
  it('位置を含む文の範囲を返す', () => {
    const text = book.paragraphs[0].text
    const [a, b] = sentenceAt(text, 9)
    expect(text.slice(a, b)).toBe('二人は川沿いを歩いた。')
  })
  it('番号は今ある最大の次。消しても既存の番号は変わらない', () => {
    expect(nextNumber([])).toBe(1)
    expect(nextNumber([note(1, 0, 0, 7, '雨が上がった。'), note(3, 1, 0, 11, '橋の上で立ち止まった。')])).toBe(4)
  })
  it('本文がずれた印を抜き書きで探し直す', () => {
    const moved = relocate(book, [note(1, 0, 0, 11, '橋の上で立ち止まった。')])
    expect(moved[0]).toMatchObject({ para: 1, start: 0, end: 11 })
  })
  it('段落のマーカーだけを返す（栞は色なしなので含めない）', () => {
    const ns = [note(1, 0, 0, 7, '雨が上がった。', 'yellow'), note(2, 0, 7, 18, '二人は川沿いを歩いた。')]
    expect(marksInParagraph(ns, 0).map((n) => n.n)).toEqual([1])
  })
})
