import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import {
  ANALYSIS_SCHEMA,
  addVocab,
  analysisCacheKey,
  costUsd,
  fingerprint,
  parseAnalysis,
  parseWord,
  partsMatch,
  removeVocab,
  searchVocab,
  systemPrompt,
  toggleLearned,
  tokenize,
  type WordEntry,
} from './study'
import { StudyError, analyze, getSpend, lookupWord, setModel, type Transport } from './studyAi'

// テストは Node で動くので、ブラウザの localStorage の代わりを置く
if (typeof globalThis.localStorage === 'undefined') {
  const m = new Map<string, string>()
  globalThis.localStorage = {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() {
      return m.size
    },
  } as Storage
}

// 「He told me that she was busy.」の見本の返事
const reply = {
  sentences: [
    {
      en: 'He told me that she was busy.',
      ja: '彼は私に、彼女は忙しいと言った。',
      pattern: 'SVOO',
      parts: [
        { text: 'He', role: 'S', note: '', inner: [] },
        { text: 'told', role: 'V', note: '', inner: [] },
        { text: 'me', role: 'O', note: '', inner: [] },
        {
          text: 'that she was busy.',
          role: 'O',
          note: 'that節',
          inner: [
            { text: 'that', role: 'X' },
            { text: 'she', role: 'S' },
            { text: 'was', role: 'V' },
            { text: 'busy.', role: 'C' },
          ],
        },
      ],
      explanation: 'tell 人 that ... の形で、目的語が2つある第4文型です。',
      alt: ['彼は、彼女が忙しいと私に言った。'],
    },
  ],
}

const word: WordEntry = {
  word: 'told',
  lemma: 'tell',
  ipa: '/tɛl/',
  sense: '言った',
  meanings: [{ pos: '動詞', ja: '話す' }, { pos: '動詞', ja: '見分ける' }],
  synonyms: [{ word: 'say', ja: '言う', nuance: '相手を取らないことが多い' }],
  examples: [{ en: 'Tell me the truth.', ja: '本当のことを言って。' }],
}

function fake(text: string, stopReason = 'end_turn'): Transport & { calls: number; last?: Parameters<Transport['send']>[0] } {
  const t = {
    calls: 0,
    last: undefined as Parameters<Transport['send']>[0] | undefined,
    async send(req: Parameters<Transport['send']>[0]) {
      t.calls++
      t.last = req
      return { text, stopReason, inputTokens: 1000, outputTokens: 2000 }
    },
  }
  return t
}

describe('parseAnalysis', () => {
  it('返事を読み、区切りが英文に戻ることを確かめる', () => {
    const a = parseAnalysis(JSON.stringify(reply), 'en-ja', 'He told me that she was busy. It rained.', 'm', 5)
    expect(a.sentences).toHaveLength(1)
    const s = a.sentences[0]
    expect(s.pattern).toBe('SVOO')
    expect(s.parts.map((p) => p.role)).toEqual(['S', 'V', 'O', 'O'])
    expect(s.parts[3].inner.map((p) => p.role)).toEqual(['X', 'S', 'V', 'C'])
    expect(s.checked).toBe(true)
    expect(a.createdAt).toBe(5)
  })

  it('AI が英文の語を書き換えたら、確認済みにしない', () => {
    const bad = structuredClone(reply)
    bad.sentences[0].parts[1].text = 'said'
    expect(parseAnalysis(JSON.stringify(bad), 'en-ja', 'He told me that she was busy.', 'm').sentences[0].checked).toBe(false)
  })

  it('英語→日本語で、元の英文に無い文を返したら確認済みにしない', () => {
    expect(parseAnalysis(JSON.stringify(reply), 'en-ja', 'Something else entirely.', 'm').sentences[0].checked).toBe(false)
  })

  it('日本語→英語では、英文は AI が作るので元の文と比べない', () => {
    expect(parseAnalysis(JSON.stringify(reply), 'ja-en', '彼は私に、彼女は忙しいと言った。', 'm').sentences[0].checked).toBe(true)
  })

  it('知らない役割や文型は X・other にする', () => {
    const odd = structuredClone(reply) as unknown as { sentences: { pattern: string; parts: { role: string }[] }[] }
    odd.sentences[0].pattern = 'SVOCC'
    odd.sentences[0].parts[0].role = 'Q'
    const s = parseAnalysis(JSON.stringify(odd), 'ja-en', 'x', 'm').sentences[0]
    expect(s.pattern).toBe('other')
    expect(s.parts[0].role).toBe('X')
  })

  it('JSON でない・文が無い返事は失敗にする', () => {
    expect(() => parseAnalysis('not json', 'en-ja', 'x', 'm')).toThrow('bad-json')
    expect(() => parseAnalysis('{"sentences":[]}', 'en-ja', 'x', 'm')).toThrow('bad-json')
  })
})

describe('partsMatch', () => {
  it('空白や引用符の違いは無視する', () => {
    expect(partsMatch({ en: "I don’t know.", parts: [{ text: "I", role: 'S', note: '', inner: [] }, { text: "don't know.", role: 'V', note: '', inner: [] }] })).toBe(true)
  })
  it('節の中の区切りが節に戻らなければ一致しない', () => {
    expect(
      partsMatch({ en: 'I think so.', parts: [{ text: 'I think so.', role: 'S', note: '', inner: [{ text: 'I', role: 'S' }] }] }),
    ).toBe(false)
  })
})

describe('tokenize', () => {
  it('単語とそれ以外に分け、つなぐと元に戻る', () => {
    const s = "It's a well-known fact, isn't it?"
    const tk = tokenize(s)
    expect(tk.map((x) => x.text).join('')).toBe(s)
    expect(tk.filter((x) => x.word).map((x) => x.text)).toEqual(["It's", 'a', 'well-known', 'fact', "isn't", 'it'])
  })
})

describe('単語帳', () => {
  it('加える・同じ語は先頭に移して重ねない・覚えた印・削除・検索', () => {
    let list = addVocab([], word, 'He told me.', 1)
    list = addVocab(list, { ...word, word: 'run', lemma: 'run', sense: '走る', meanings: [] }, 'I run.', 2)
    expect(list.map((v) => v.id)).toEqual(['run', 'tell'])
    list = toggleLearned(list, 'tell')
    expect(list.find((v) => v.id === 'tell')!.learned).toBe(true)
    list = addVocab(list, { ...word, word: 'Tells' }, 'She tells.', 3)
    expect(list.map((v) => v.id)).toEqual(['tell', 'run'])
    expect(list[0].learned).toBe(false)
    expect(list[0].context).toBe('She tells.')
    expect(searchVocab(list, '見分け').map((v) => v.id)).toEqual(['tell'])
    expect(searchVocab(list, 'RU').map((v) => v.id)).toEqual(['run'])
    expect(removeVocab(list, 'run').map((v) => v.id)).toEqual(['tell'])
  })
})

describe('parseWord', () => {
  it('単語の説明を読む', () => {
    const w = parseWord(JSON.stringify(word))
    expect(w.lemma).toBe('tell')
    expect(w.synonyms[0].word).toBe('say')
  })
  it('見出し語が無ければ失敗', () => {
    expect(() => parseWord('{"word":"","lemma":""}')).toThrow('bad-json')
  })
})

describe('その他', () => {
  it('指紋は同じ入力で同じ、違う入力で違う', () => {
    expect(fingerprint('abc')).toBe(fingerprint('abc'))
    expect(fingerprint('abc')).not.toBe(fingerprint('abd'))
    expect(analysisCacheKey('en-ja', ' x ', 'm')).toBe(analysisCacheKey('en-ja', 'x', 'm'))
    expect(analysisCacheKey('en-ja', 'x', 'm')).not.toBe(analysisCacheKey('ja-en', 'x', 'm'))
  })
  it('料金の目安', () => {
    expect(costUsd('claude-opus-5-5', 1_000_000, 1_000_000)).toBe(24)
    expect(costUsd('claude-haiku-5-5', 1_000_000, 0)).toBeCloseTo(0.1)
    expect(costUsd('unknown', 1, 1)).toBe(0)
  })
  it('指示は方向ごとに違い、スキーマは追加の項目を許さない', () => {
    expect(systemPrompt('ja-en')).toContain('natural English')
    expect(systemPrompt('en-ja')).toContain('exactly as written')
    expect(ANALYSIS_SCHEMA.additionalProperties).toBe(false)
  })
})

describe('analyze / lookupWord', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('AI に送り、結果を保存して、2 回目は送らない', async () => {
    const t = fake(JSON.stringify(reply))
    const text = 'He told me that she was busy. (1)'
    const a = await analyze('en-ja', text, t)
    expect(a.sentences[0].pattern).toBe('SVOO')
    expect(t.last!.model).toBe('claude-opus-5-5')
    expect(t.last!.text).toBe(text)
    expect(t.last!.system).toContain('exactly as written')
    await analyze('en-ja', text, t)
    expect(t.calls).toBe(1)
    expect(getSpend()).toBeCloseTo(0.044)
  })

  it('モデルを変えると、そのモデルで送り直す', async () => {
    const t = fake(JSON.stringify(reply))
    const text = 'He told me that she was busy. (2)'
    await analyze('en-ja', text, t)
    setModel('claude-haiku-5-5')
    await analyze('en-ja', text, t)
    expect(t.calls).toBe(2)
    expect(t.last!.model).toBe('claude-haiku-5-5')
  })

  it('断られた・長すぎて切れた・形が違う返事は、それぞれの失敗にする', async () => {
    await expect(analyze('en-ja', 'a (3)', fake('{}', 'refusal'))).rejects.toMatchObject({ kind: 'refusal' })
    await expect(analyze('en-ja', 'a (4)', fake('{}', 'max_tokens'))).rejects.toMatchObject({ kind: 'too-long' })
    await expect(analyze('en-ja', 'a (5)', fake('oops'))).rejects.toMatchObject({ kind: 'bad-json' })
    await expect(analyze('en-ja', 'x'.repeat(1201), fake('{}'))).rejects.toMatchObject({ kind: 'too-long' })
  })

  it('API キーが無ければ送らずに知らせる', async () => {
    await expect(analyze('en-ja', 'a (6)')).rejects.toBeInstanceOf(StudyError)
    await expect(analyze('en-ja', 'a (6)')).rejects.toMatchObject({ kind: 'no-key' })
  })

  it('単語を調べて保存する', async () => {
    const t = fake(JSON.stringify(word))
    const w = await lookupWord('told', 'He told me.', t)
    expect(w.lemma).toBe('tell')
    expect(t.last!.text).toContain('Word: told')
    await lookupWord('told', 'He told me.', t)
    expect(t.calls).toBe(1)
  })
})
