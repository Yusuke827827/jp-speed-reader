import { describe, expect, it } from 'vitest'
import { buildBookText } from './book'
import { segmentBook, segmentSentence, splitLong, splitSentences, chunkIndexAt, visible } from './segment'
import { buildSchedule, effectiveCpm } from './timing'

// テスト文はすべてこのプロジェクト用に書いたもの
const SAMPLE =
  '朝の駅は、思ったより静かだった。「おはよう。今日は早いね」と彼女は言った。改札の時計は７時４５分を指していて、気温は12.5度しかない。'

describe('splitSentences', () => {
  it('句点と、会話の閉じ括弧で文を区切る', () => {
    const s = splitSentences(SAMPLE).map(([a, b]) => SAMPLE.slice(a, b))
    expect(s).toEqual([
      '朝の駅は、思ったより静かだった。',
      '「おはよう。今日は早いね」と彼女は言った。',
      '改札の時計は７時４５分を指していて、気温は12.5度しかない。',
    ])
  })
  it('括弧の中の句点では区切らない', () => {
    const t = '「行こう。早く」と言った。'
    expect(splitSentences(t).length).toBe(1)
  })
})

describe('segmentSentence', () => {
  it('文節モードで、数字を途中で切らない', () => {
    const parts = segmentSentence('改札の時計は７時４５分を指していて、気温は12.5度しかない。', {
      mode: 'bunsetsu',
      phraseTarget: 8,
    })
    expect(parts.join('')).toBe('改札の時計は７時４５分を指していて、気温は12.5度しかない。')
    expect(parts.some((p) => p.includes('12.5'))).toBe(true)
    for (const p of parts) expect(visible(p)).toBeLessThanOrEqual(10)
  })
  it('句読点や閉じ括弧で始まる単位を作らない', () => {
    for (const mode of ['char', 'short', 'bunsetsu', 'phrase', 'sentence'] as const) {
      const parts = segmentSentence('「おはよう。今日は早いね」と彼女は言った。', { mode, phraseTarget: 8 })
      for (const p of parts) expect(p[0]).not.toMatch(/[、。」』）]/)
      expect(parts.join('').replace(/\s/g, '')).toBe('「おはよう。今日は早いね」と彼女は言った。')
    }
  })
  it('2〜4文字モードは 4 文字を超えない', () => {
    const parts = segmentSentence('改札の時計は７時４５分を指していて、気温は低い。', { mode: 'short', phraseTarget: 8 })
    for (const p of parts) expect(visible(p)).toBeLessThanOrEqual(5) // 句読点 1 文字の付加を許す
  })
  it('文モードで長い文を読点で分ける', () => {
    const long = '駅前の通りを抜けて、川沿いの細い道に入ると、古い自転車屋の看板が見えてきて、その先にある小さな公園では子どもたちが遊んでいた。'
    const parts = segmentSentence(long, { mode: 'sentence', phraseTarget: 8 })
    expect(parts.length).toBeGreaterThan(1)
    for (const p of parts) expect(visible(p)).toBeLessThanOrEqual(28)
  })
})

describe('splitLong', () => {
  it('長い数字列を壊さないよう、切れない場合だけ強制的に切る', () => {
    expect(splitLong('1234567890', 4).join('')).toBe('1234567890')
  })
})

describe('segmentBook と位置', () => {
  const book = buildBookText(
    [
      { pageIndex: 0, text: '一つ目の段落です。\n二つ目の段落は次の', contFromPrev: false },
      { pageIndex: 1, text: 'ページへ続きます。\n三つ目。', contFromPrev: true },
    ],
    2,
  )
  it('ページをまたぐ段落を連結する', () => {
    expect(book.paragraphs.map((p) => p.text)).toEqual(['一つ目の段落です。', '二つ目の段落は次のページへ続きます。', '三つ目。'])
    expect(book.paragraphs[1].pageMarks).toEqual([
      [0, 0],
      [9, 1],
    ])
  })
  it('段落末に段落の間、文末に文の間を付ける', () => {
    const chunks = segmentBook(book, { mode: 'phrase', phraseTarget: 8 })
    expect(chunks[chunks.length - 1].pause).toBe('paragraph')
    const firstParaEnd = chunks.filter((c) => c.para === 0).pop()!
    expect(firstParaEnd.pause).toBe('paragraph')
    // 位置 → チャンクの対応
    const i = chunkIndexAt(chunks, { para: 1, offset: 10 })
    expect(chunks[i].para).toBe(1)
    expect(chunks[i].start).toBeLessThanOrEqual(10)
    expect(chunks[i].end).toBeGreaterThan(10)
  })
  it('文字の欠落なく全文をカバーする', () => {
    for (const mode of ['char', 'short', 'bunsetsu', 'phrase', 'sentence'] as const) {
      const chunks = segmentBook(book, { mode, phraseTarget: 8 })
      const joined = book.paragraphs.map((_, pi) => chunks.filter((c) => c.para === pi).map((c) => c.text).join(''))
      expect(joined).toEqual(book.paragraphs.map((p) => p.text))
    }
  })
})

describe('timing', () => {
  const book = buildBookText([{ pageIndex: 0, text: SAMPLE.repeat(20), contFromPrev: false }], 1)
  it('間を入れても全体の実速度が設定速度と一致する', () => {
    for (const mode of ['char', 'short', 'bunsetsu', 'phrase', 'sentence'] as const) {
      const chunks = segmentBook(book, { mode, phraseTarget: 8 })
      for (const cpm of [300, 600, 1200]) {
        const s = buildSchedule(chunks, { cpm, pauses: true, pauseScale: 1 })
        expect(Math.abs(effectiveCpm(chunks, s) - cpm) / cpm).toBeLessThan(0.01)
      }
    }
  })
  it('段落ごとに区切った約240字の区間それぞれでも、実速度が設定速度と一致する', () => {
    // 会話の短い段落と地の文の長い段落を交互に並べた本
    const paras = Array.from({ length: 80 }, (_, i) =>
      i % 2 ? '「そうだね」' : '川沿いの道を歩いていると、向こうから自転車が一台、ゆっくりと近づいてきた。荷台には大きな箱が載っている。',
    )
    const b = buildBookText([{ pageIndex: 0, text: paras.join('\n'), contFromPrev: false }], 1)
    const chunks = segmentBook(b, { mode: 'phrase', phraseTarget: 7 })
    const s = buildSchedule(chunks, { cpm: 600, pauses: true, pauseScale: 1.5 })
    let checked = 0
    for (const [from, to] of s.blocks) {
      const chars = chunks.slice(from, to).reduce((a, c) => a + c.len, 0)
      expect(chunks[to - 1].pause).toBe('paragraph') // 区間は段落の切れ目で終わる
      expect(chars).toBeGreaterThanOrEqual(120)
      const cpm = effectiveCpm(chunks, s, from, to)
      expect(Math.abs(cpm - 600) / 600).toBeLessThan(0.01)
      checked++
    }
    expect(checked).toBeGreaterThan(3)
  })
  it('句点の後は読点の後より長く表示する', () => {
    const chunks = segmentBook(book, { mode: 'bunsetsu', phraseTarget: 8 })
    const s = buildSchedule(chunks, { cpm: 600, pauses: true, pauseScale: 1 })
    const per = (p: string) => {
      const xs = chunks.map((c, i) => [c, i] as const).filter(([c]) => c.pause === p)
      return xs.reduce((a, [c, i]) => a + s.weights[i] - c.len, 0) / xs.length
    }
    expect(per('sentence')).toBeGreaterThan(per('comma'))
  })
})

describe('最小字数・保護範囲・人物名', () => {
  const book = buildBookText(
    [{ pageIndex: 0, text: '｜千晴《ちはる》は湊の手を引いて、川沿いの道を走った。', contFromPrev: false }],
    1,
  )
  it('最小字数より短い単位を作らない（文末の単位も前とつなぐ）', () => {
    const chunks = segmentBook(book, { mode: 'bunsetsu', phraseTarget: 7, minChars: 3 })
    for (const c of chunks) expect(c.len).toBeGreaterThanOrEqual(3)
    expect(chunks.map((c) => c.text).join('')).toBe(book.paragraphs[0].text)
  })
  it('ルビの親文字と人物名を途中で切らず、人物名を含む単位に印を付ける', () => {
    const chunks = segmentBook(book, { mode: 'char', phraseTarget: 7, names: ['千晴', '湊'] })
    expect(chunks.some((c) => c.text.startsWith('千晴'))).toBe(true)
    expect(chunks.filter((c) => c.name).map((c) => c.text)).toEqual(['千晴', '湊'])
  })
  it('人物名を含む単位は、表示時間を少し長くする', () => {
    const chunks = segmentBook(book, { mode: 'bunsetsu', phraseTarget: 7, names: ['湊'] })
    const i = chunks.findIndex((c) => c.name)
    const off = buildSchedule(chunks, { cpm: 600, pauses: false, pauseScale: 1 })
    const on = buildSchedule(chunks, { cpm: 600, pauses: false, pauseScale: 1, nameBoost: true })
    expect(on.weights[i] - off.weights[i]).toBeGreaterThan(1)
  })
})

describe('記号と括弧の扱い', () => {
  it('長い「……」「――」「ーーー」を途中で切らない', () => {
    for (const mode of ['short', 'bunsetsu', 'phrase'] as const) {
      const parts = segmentSentence('「…………………………」と彼は黙りこんだ。', { mode, phraseTarget: 7 })
      expect(parts.some((p) => p.includes('…………………………'))).toBe(true)
      const parts2 = segmentSentence('風がヒューーーーーーーーーーと鳴った。', { mode, phraseTarget: 7 })
      for (const p of parts2) expect(p[0]).not.toBe('ー')
    }
  })
  it('閉じ括弧と「!!」を次の単位の頭に置かない', () => {
    for (const mode of ['short', 'bunsetsu', 'phrase', 'sentence'] as const) {
      const parts = segmentSentence('《解析が終わりました》それなら安心だ!!本当にありがとう', { mode, phraseTarget: 7 })
      for (const p of parts) expect(p[0]).not.toMatch(/[》」!]/)
      expect(parts.join('')).toBe('《解析が終わりました》それなら安心だ!!本当にありがとう')
    }
  })
})
