import { describe, expect, it } from 'vitest'
import { itemsToLines, joinLine, linesToPageTexts, type RawItem } from './layout'
import { buildBookText } from './book'
import { segmentBook, segmentSentence, splitSentences } from './segment'
import { buildSchedule, durationOf } from './timing'

// テスト文はすべてこのプロジェクト用に書いたもの

/** 横書きの 1 行を、単語ごとの断片にする（単語間は gap 文字分あける） */
function wordItems(line: string, x: number, y: number, gap = 0.2, size = 10): RawItem[] {
  const items: RawItem[] = []
  let cx = x
  for (const w of line.split(' ')) {
    const width = w.length * size * 0.5
    items.push({ str: w, x: cx, y, w: width, h: size, size, vertical: false })
    cx += width + size * gap
  }
  return items
}

describe('joinLine（英語）', () => {
  it('行末のハイフンで分かれた単語をつなぐ', () => {
    expect(joinLine('this is an exam-', 'ple of text')).toBe('this is an example of text')
  })
  it('1 文字の単語や数字の後にも空白を入れる', () => {
    expect(joinLine('there was a', 'cat')).toBe('there was a cat')
    expect(joinLine('so I', 'left')).toBe('so I left')
    expect(joinLine('in 2020', 'the team')).toBe('in 2020 the team')
    expect(joinLine('see Figure', '3 below')).toBe('see Figure 3 below')
    expect(joinLine('as noted (Smith)', 'and others')).toBe('as noted (Smith) and others')
  })
  it('行をまたぐ小数や桁区切りには空白を入れない', () => {
    expect(joinLine('気温は12.', '5度')).toBe('気温は12.5度')
    expect(joinLine('cost 1,', '000 yen')).toBe('cost 1,000 yen')
  })
  it('日本語どうしには空白を入れない', () => {
    expect(joinLine('坂の上の', '図書館')).toBe('坂の上の図書館')
    expect(joinLine('PDFの', 'ファイル')).toBe('PDFのファイル')
  })
})

describe('英単語の間の空白', () => {
  it('断片が単語ごとに分かれていても、単語の間に空白を入れる', () => {
    const [p] = linesToPageTexts([itemsToLines(wordItems('I saw a cat on the mat', 50, 800))])
    expect(p.text).toBe('I saw a cat on the mat')
  })
})

describe('数字の断片', () => {
  it('数字が 1 文字ずつ離れて配置されていても、間に空白を入れない', () => {
    const items: RawItem[] = ['2', '0', '2', '6', '年'].map((c, i) => ({ str: c, x: 50 + i * 10, y: 800, w: 6, h: 10, size: 10, vertical: false }))
    const [p] = linesToPageTexts([itemsToLines(items)])
    expect(p.text).toBe('2026年')
  })
})

describe('2段組み', () => {
  it('左の段を読み終えてから右の段を読む', () => {
    const left = ['The first column starts', 'here and keeps going', 'down the page and']
    const right = ['the second column', 'continues the story', 'until the end.']
    const items: RawItem[] = []
    left.forEach((l, i) => items.push(...wordItems(l, 50, 800 - i * 14)))
    right.forEach((l, i) => items.push(...wordItems(l, 320, 800 - i * 14)))
    const [p] = linesToPageTexts([itemsToLines(items)])
    expect(p.text).toBe(
      'The first column starts here and keeps going down the page and the second column continues the story until the end.',
    )
  })
})

describe('英語の段落', () => {
  it('短い行がピリオドで終われば段落を区切る', () => {
    const lines = ['The first paragraph is long enough', 'to wrap and ends here.', 'The next paragraph starts', 'on this line and goes on.']
    const items: RawItem[] = []
    lines.forEach((l, i) => items.push(...wordItems(l, 50, 800 - i * 14)))
    const [p] = linesToPageTexts([itemsToLines(items)])
    expect(p.text.split('\n')).toEqual([
      'The first paragraph is long enough to wrap and ends here.',
      'The next paragraph starts on this line and goes on.',
    ])
  })
})

describe('splitSentences（英語）', () => {
  it('ピリオドで文を区切り、略語・小数・頭文字では区切らない', () => {
    const t = 'Dr. Smith arrived at 3.5 p.m. on Monday. It was late. See Fig. 2 for details, e.g. the map. J. R. Tolkien agreed.'
    const s = splitSentences(t).map(([a, b]) => t.slice(a, b).trim())
    expect(s).toEqual([
      'Dr. Smith arrived at 3.5 p.m. on Monday.',
      'It was late.',
      'See Fig. 2 for details, e.g. the map.',
      'J. R. Tolkien agreed.',
    ])
  })
  it('日本語の小数点では区切らない', () => {
    const t = '気温は12.5度だった。風は弱い。'
    expect(splitSentences(t).length).toBe(2)
  })
})

describe('英語の分割', () => {
  const text =
    'Reading long documents on a phone is hard. The internationalization team wrote a report, and everyone read it.'
  const book = buildBookText([{ pageIndex: 0, text, contFromPrev: false }], 1)
  it('どのモードでも単語の途中で切らない', () => {
    const words = new Set(text.split(' '))
    for (const mode of ['char', 'short', 'bunsetsu', 'phrase', 'sentence'] as const) {
      const chunks = segmentBook(book, { mode, phraseTarget: 7 })
      for (const c of chunks) for (const w of c.text.split(' ')) expect(words.has(w)).toBe(true)
      expect(chunks.map((c) => c.text).join(' ')).toBe(text)
    }
  })
  it('文末のピリオドの後に文の間を入れる', () => {
    const chunks = segmentBook(book, { mode: 'bunsetsu', phraseTarget: 7 })
    const hard = chunks.find((c) => c.text.endsWith('hard.'))!
    expect(hard.pause).toBe('sentence')
  })
  it('フレーズモードでは短い単語をつないで数語ずつにする', () => {
    const parts = segmentSentence('Reading long documents on a phone is hard.', { mode: 'phrase', phraseTarget: 7 })
    expect(parts.length).toBeGreaterThan(1)
    expect(parts.length).toBeLessThan(8)
  })
})

describe('英語の速度（WPM）', () => {
  const para =
    'Reading long documents on a phone is hard, but it gets easier with practice. The report explains why, and it suggests a few simple steps.'
  const mixed = [para, '川沿いの道を歩いていると、向こうから自転車が一台、ゆっくりと近づいてきた。荷台には大きな箱が載っている。']
  const book = buildBookText([{ pageIndex: 0, text: Array.from({ length: 40 }, (_, i) => mixed[i % 2]).join('\n'), contFromPrev: false }], 1)
  it('英語の単位は語数を持つ', () => {
    const chunks = segmentBook(book, { mode: 'phrase', phraseTarget: 7 })
    const en = chunks.filter((c) => c.para === 0)
    expect(en.reduce((a, c) => a + (c.words ?? 0), 0)).toBe(para.split(' ').length)
    expect(chunks.filter((c) => c.para === 1).every((c) => c.words === undefined)).toBe(true)
  })
  it('英語は WPM、日本語は字/分の設定どおりの速さで表示する', () => {
    for (const mode of ['bunsetsu', 'phrase', 'sentence'] as const) {
      const chunks = segmentBook(book, { mode, phraseTarget: 7 })
      const s = buildSchedule(chunks, { cpm: 600, wpm: 300, pauses: true, pauseScale: 1 })
      let enMs = 0
      let enWords = 0
      let jaMs = 0
      let jaChars = 0
      chunks.forEach((c, i) => {
        if (c.words !== undefined) {
          enMs += durationOf(s, i)
          enWords += c.words
        } else {
          jaMs += durationOf(s, i)
          jaChars += c.len
        }
      })
      expect(Math.abs((enWords / enMs) * 60000 - 300) / 300).toBeLessThan(0.05)
      expect(Math.abs((jaChars / jaMs) * 60000 - 600) / 600).toBeLessThan(0.05)
    }
  })
})
