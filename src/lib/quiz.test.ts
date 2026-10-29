import { describe, expect, it } from 'vitest'
import { buildBookText } from './book'
import { buildQuiz, readSentences } from './quiz'

// テスト文はこのプロジェクト用に書いたもの
const text = [
  '千晴は朝早く駅に着いた。改札の前で湊が待っていた。',
  '二人は川沿いの道を歩き、古い図書館の前で立ち止まった。',
  '湊は鞄から地図を取り出し、渡し場の跡を指でたどった。',
  '千晴は窓口で切符を二枚買い、ホームのベンチに座った。',
  '電車が鉄橋を渡ると、遠くに灯台が見えてきた。',
  '湊は帰りにもう一度、図書館へ寄ろうと言った。',
].join('\n')
const book = buildBookText([{ pageIndex: 0, text, contFromPrev: false }], 1)
const end = { para: book.paragraphs.length - 1, offset: book.paragraphs[book.paragraphs.length - 1].text.length }

function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  }
}

describe('理解度の確認', () => {
  it('読んだ位置より前の文だけを、本文の順に集める', () => {
    const s = readSentences(book, { para: 2, offset: 0 })
    expect(s.map((x) => x.para)).toEqual([0, 0, 1])
    expect(s[0].text).toBe('千晴は朝早く駅に着いた。')
  })
  it('穴埋めは、正解を含む 4 つの候補で、隠した語は文に残らない', () => {
    for (let seed = 1; seed < 30; seed++) {
      const qs = buildQuiz(book, end, ['千晴', '湊'], seeded(seed))
      expect(qs.length).toBe(3)
      for (const q of qs) {
        if (q.kind !== 'cloze') continue
        expect(q.choices).toHaveLength(4)
        expect(new Set(q.choices).size).toBe(4)
        expect(q.choices).toContain(q.answer)
        expect(q.before + q.answer + q.after).toBe(q.src.text)
        expect(q.before + q.after).not.toContain(q.answer)
      }
    }
  })
  it('人物名のある文では、人物名を隠す', () => {
    const qs = buildQuiz(book, end, ['千晴', '湊'], seeded(3))
    const cloze = qs.filter((q) => q.kind === 'cloze')
    expect(cloze.some((q) => q.kind === 'cloze' && ['千晴', '湊'].includes(q.answer))).toBe(true)
  })
  it('順番の問題の正解は、本文で先に出てくる文', () => {
    for (let seed = 1; seed < 30; seed++) {
      const q = buildQuiz(book, end, [], seeded(seed)).find((x) => x.kind === 'order')!
      expect(q.kind).toBe('order')
      if (q.kind !== 'order') continue
      const [first, second] = q.first === 'a' ? [q.a, q.b] : [q.b, q.a]
      expect(first.para * 1000 + first.start).toBeLessThan(second.para * 1000 + second.start)
    }
  })
  it('読んだ文が少ないときは問題を作らない', () => {
    expect(buildQuiz(book, { para: 1, offset: 0 }, [])).toEqual([])
  })
})
