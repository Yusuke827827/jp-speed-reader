import { describe, expect, it } from 'vitest'
import { addVocab, parseAnalysis, type Sentence, type VocabItem, type WordEntry } from './study'
import {
  INTERVAL_DAYS,
  applyReview,
  dueItems,
  flowUnits,
  folders,
  grammarCounts,
  layoutParts,
  newMaterial,
  putMaterial,
  recordReading,
  updateMaterial,
  vocabProgress,
  review,
  scoreReading,
  splitForAnalysis,
  unitMs,
} from './studyTools'

const DAY = 86400000
const entry: WordEntry = { word: 'run', lemma: 'run', ipa: '', level: 'A1', sense: '走る', meanings: [], synonyms: [], examples: [] }

describe('復習の予定', () => {
  it('入れた直後に出て、正解するたびに間が空き、5 回で覚えた扱い', () => {
    let v: VocabItem = addVocab([], entry, 'I run.', 0)[0]
    expect(dueItems([v], 0)).toHaveLength(1)
    v = review(v, true, 0)
    expect(v.box).toBe(1)
    expect(v.due).toBe(INTERVAL_DAYS[1] * DAY)
    expect(dueItems([v], DAY - 1)).toHaveLength(0)
    expect(dueItems([v], DAY)).toHaveLength(1)
    for (let i = 0; i < 4; i++) v = review(v, true, 0)
    expect(v.box).toBe(5)
    expect(v.learned).toBe(true)
    expect(dueItems([v], 10 ** 13)).toHaveLength(0)
  })
  it('間違えると最初の箱に戻り、10 分後にまた出る', () => {
    let v = review(addVocab([], entry, '', 0)[0], true, 0)
    v = review(v, false, 1000)
    expect(v.box).toBe(0)
    expect(v.misses).toBe(1)
    expect(v.due).toBe(1000 + 600000)
  })
  it('古い版の単語（箱と期限が無い）は、入れた時刻を期限として扱う', () => {
    const old = { id: 'x', entry, context: '', addedAt: 5, learned: false } as VocabItem
    expect(dueItems([old], 5)).toHaveLength(1)
    expect(applyReview([old], 'x', true, 5)[0].box).toBe(1)
  })
})

const reply = (en: string, grammar: string[], hard: { word: string; level: string }[] = []) =>
  JSON.stringify({ sentences: [{ en, ja: '', pattern: 'SV', parts: [{ text: en, role: 'S', note: '', inner: [] }], explanation: '', alt: [], grammar, hard, original: '', fixes: [] }] })

describe('教材', () => {
  const a1 = parseAnalysis(reply('I have been there.', ['現在完了', 'ない文法'], [{ word: 'There', level: 'B1' }]), 'en-ja', 'I have been there.', 'm', 1)
  const a2 = parseAnalysis(reply('It was made.', ['受動態', '現在完了'], [{ word: 'made', level: 'A1' }, { word: 'x', level: 'Z9' }]), 'en-ja', 'It was made.', 'm', 2)
  it('分けて解析した文章を 1 つの教材にまとめる', () => {
    expect(a1.sentences[0].grammar).toEqual(['現在完了'])
    expect(a2.sentences[0].hard).toEqual([{ word: 'made', level: 'A1' }])
    const m = newMaterial('id1', ['k1', 'k2'], [a1, a2], ' Lesson 1 ', 9)
    expect(m).toMatchObject({ title: 'I have been there.', folder: 'Lesson 1', count: 2, keys: ['k1', 'k2'], grammar: ['現在完了', '受動態'], hard: ['there', 'made'], createdAt: 9 })
  })
  it('音読は合格点以上で数え、読んでいた位置を残す', () => {
    let m = newMaterial('id1', ['k1'], [a1, a2])
    m = recordReading(m, 1, 79)
    expect(m.readOk).toEqual([])
    expect(m.last).toBe(1)
    m = recordReading(recordReading(m, 1, 80), 0, 100)
    expect(m.readOk).toEqual([0, 1])
    expect(recordReading(m, 1, 100).readOk).toEqual([0, 1])
  })
  it('語彙の進み具合・フォルダ・文法の件数・並べ替え', () => {
    const m1 = newMaterial('id1', [], [a1, a2], 'B')
    const m2 = newMaterial('id2', [], [a2], 'A')
    expect(vocabProgress(m1, addVocab([], { ...entry, word: 'made', lemma: 'make' }, ''))).toEqual({ have: 1, total: 2 })
    let list = putMaterial(putMaterial([], m1), m2)
    expect(list.map((x) => x.id)).toEqual(['id2', 'id1'])
    list = updateMaterial(list, 'id1', (x) => ({ ...x, title: 'T' }))
    expect(list[1].title).toBe('T')
    expect(folders(list)).toEqual(['A', 'B'])
    expect(grammarCounts(list)).toEqual([
      { grammar: '現在完了', count: 2 },
      { grammar: '受動態', count: 2 },
    ])
  })
})

describe('splitForAnalysis', () => {
  it('文の終わりで分け、上限の長さにまとめる', () => {
    const s = 'One two. Three four! Five six? Seven.'
    expect(splitForAnalysis(s, 1000)).toEqual([s])
    expect(splitForAnalysis(s, 20)).toEqual(['One two. Three four!', 'Five six? Seven.'])
    expect(splitForAnalysis('これは文です。次の文です。', 1000)).toEqual(['これは文です。次の文です。'])
  })
  it('上限より長い 1 文は空白の位置で切る', () => {
    const parts = splitForAnalysis('aaaa bbbb cccc dddd', 10)
    expect(parts.every((p) => p.length <= 10)).toBe(true)
    expect(parts.join(' ')).toBe('aaaa bbbb cccc dddd')
  })
})

describe('流して読む', () => {
  const s: Sentence = {
    en: 'I think that the man who lives next door is a doctor.',
    ja: '',
    pattern: 'SVO',
    parts: [
      { text: 'I', role: 'S', note: '', inner: [] },
      { text: 'think', role: 'V', note: '', inner: [] },
      {
        text: 'that the man who lives next door is a doctor.',
        role: 'O',
        note: '',
        inner: [
          { text: 'that', role: 'X' },
          { text: 'the man who lives next door', role: 'S' },
          { text: 'is', role: 'V' },
          { text: 'a doctor.', role: 'C' },
        ],
      },
    ],
    explanation: '',
    alt: [],
    grammar: [],
    hard: [],
    original: '',
    fixes: [],
    checked: true,
  }
  it('長い節は中の要素に分け、文の最後に印を付ける', () => {
    const u = flowUnits([s])
    expect(u.map((x) => x.text)).toEqual(['I', 'think', 'that', 'the man who lives next door', 'is', 'a doctor.'])
    expect(u[3].sub).toBe(true)
    expect(u.at(-1)!.end).toBe(true)
  })
  it('表示時間は語数に比例し、下限と文末の間がある', () => {
    const [a, , , b] = flowUnits([s])
    expect(unitMs(a, 200)).toBe(300)
    expect(unitMs(b, 200)).toBe(1800)
    expect(unitMs({ ...b, end: true }, 200)).toBe(2250)
  })
})

describe('音読の採点', () => {
  it('語の並びを突き合わせ、言えなかった語に印を付ける', () => {
    const r = scoreReading("I don't know what to do.", 'i dont know what do')
    expect(r.words.map((w) => w.ok)).toEqual([true, false, true, true, false, true])
    expect(r.score).toBe(67)
    expect(scoreReading('Hello world.', 'hello world').score).toBe(100)
    expect(scoreReading('Hello.', '').score).toBe(0)
  })
})

describe('共有画像の折り返し', () => {
  const measure = (s: string) => s.length * 10
  it('幅に収まらない要素は次の行へ、長すぎる要素は語の境目で分ける', () => {
    const lines = layoutParts(
      [
        { text: 'I', role: 'S' },
        { text: 'saw', role: 'V' },
        { text: 'a very long object phrase here', role: 'O' },
      ],
      measure,
      120,
      10,
    )
    expect(lines.map((l) => l.map((x) => x.text))).toEqual([['I', 'saw'], ['a very long'], ['object'], ['phrase here']])
    expect(lines[0][1].x).toBe(20)
    expect(lines.flat().every((x) => x.width <= 120)).toBe(true)
  })
})
