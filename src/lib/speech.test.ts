import { describe, expect, it } from 'vitest'
import { buildBookText } from './book'
import { segmentBook } from './segment'
import { chunkAtOffset, sentenceRange, speechText } from './speech'

// テスト文はこのプロジェクト用に書いたもの
const book = buildBookText([{ pageIndex: 0, text: '雨が上がったので、二人は川沿いの道を歩いた。橋の上で立ち止まった。\n次の段落。', contFromPrev: false }], 1)
const chunks = segmentBook(book, { mode: 'bunsetsu', phraseTarget: 7, minChars: 1 })

describe('読み上げの区切り', () => {
  it('1 文ぶんの単位を返し、文末の単位で終わる', () => {
    const [a, b] = sentenceRange(chunks, 0)
    const text = chunks.slice(a, b).map((c) => c.text).join('')
    expect(text).toBe('雨が上がったので、二人は川沿いの道を歩いた。')
    const [c, d] = sentenceRange(chunks, b)
    expect(chunks.slice(c, d).map((x) => x.text).join('')).toBe('橋の上で立ち止まった。')
  })
  it('長い文は指定の字数ほどで切る', () => {
    const [a, b] = sentenceRange(chunks, 0, 8)
    const len = chunks.slice(a, b).reduce((n, c) => n + c.len, 0)
    expect(len).toBeGreaterThanOrEqual(8)
    expect(len - chunks[b - 1].len).toBeLessThan(8)
  })
  it('段落をまたがない', () => {
    const [, b] = sentenceRange(chunks, 0)
    const [, d] = sentenceRange(chunks, b)
    expect(chunks[d].para).toBe(1)
  })
  it('読んでいる文字の位置から、表示する単位を選ぶ', () => {
    const [a, b] = sentenceRange(chunks, 0)
    const target = chunks.findIndex((c) => c.text.startsWith('二人'))
    expect(chunkAtOffset(chunks, a, b, chunks[target].start + 1)).toBe(target)
    expect(chunkAtOffset(chunks, a, b, 0)).toBe(a)
  })
})

describe('読み上げる文字列', () => {
  it('ルビのある語は読みに置き換え、元の位置を対応づける', () => {
    const para = { text: '彼方を見た', ruby: [{ start: 0, end: 2, text: 'かなた' }], pageMarks: [], globalStart: 0 }
    const { text, map } = speechText(para as never, 0, 5)
    expect(text).toBe('かなたを見た')
    expect(map).toEqual([0, 0, 0, 2, 3, 4])
  })
})
