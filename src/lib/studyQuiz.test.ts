import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { QUIZ_MAX_TEXT, SKILLS, addAnswers, overall, parseQuiz, quizRequestText, skillStats, stateOf, type Answer } from './studyQuiz'
import { generateQuiz, loadAnswers, loadQuiz, saveAnswers, type Transport } from './studyAi'
import { setKV } from './db'
import { newMaterial } from './studyTools'
import { parseAnalysis } from './study'

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

const q = (over: Record<string, unknown> = {}) => ({
  prompt: '下線部の意味として最も適切なものを選べ。',
  quote: 'gave up',
  choices: ['あきらめた', '与えた', '上げた', '起きた'],
  answer: 0,
  explanation: 'give up は「あきらめる」。',
  skill: '語彙',
  type: 'meaning',
  sentence: 1,
  ...over,
})

describe('parseQuiz', () => {
  it('設問を読み、形のおかしい設問だけを捨てる', () => {
    const json = JSON.stringify({
      questions: [
        q(),
        q({ choices: ['a', 'b', 'c'] }),
        q({ answer: 4 }),
        q({ choices: ['a', 'a', 'b', 'c'] }),
        q({ skill: 'ない力', type: 'ない形', sentence: 99 }),
      ],
    })
    const quiz = parseQuiz(json, 'm1', 'model', 3, 7)
    expect(quiz.questions).toHaveLength(2)
    expect(quiz.questions[1]).toMatchObject({ skill: '内容理解', type: 'content', sentence: -1 })
    expect(quiz).toMatchObject({ materialId: 'm1', model: 'model', createdAt: 7 })
  })
  it('使える設問が 1 つも無ければ失敗', () => {
    expect(() => parseQuiz(JSON.stringify({ questions: [q({ answer: -1 })] }), 'm', 'x', 1)).toThrow('bad-json')
    expect(() => parseQuiz('oops', 'm', 'x', 1)).toThrow('bad-json')
  })
})

describe('quizRequestText', () => {
  it('文に番号を付け、上限を超える分は落とす', () => {
    expect(quizRequestText(['A.', 'B.'])).toBe('[0] A.\n[1] B.')
    const long = Array.from({ length: 1000 }, () => 'x'.repeat(50))
    expect(quizRequestText(long).length).toBeLessThanOrEqual(QUIZ_MAX_TEXT)
  })
})

describe('分析', () => {
  const ans = (skill: Answer['skill'], correct: boolean, i = 0): Answer => ({ materialId: 'm', question: i, skill, correct, at: i })
  it('答えが無い力は未測定、少ないうちは練習中、正答率で得意・苦手', () => {
    expect(stateOf(0, null)).toBe('untested')
    expect(stateOf(2, 100)).toBe('practice')
    expect(stateOf(5, 80)).toBe('good')
    expect(stateOf(5, 40)).toBe('weak')
    expect(stateOf(5, 60)).toBe('practice')
  })
  it('力ごとの直近の正答率を、苦手な順に並べる', () => {
    const list = [
      ...[true, true, true, true].map((c, i) => ans('語彙', c, i)),
      ...[false, false, true].map((c, i) => ans('関係詞', c, i)),
      ans('時制', true),
    ]
    const st = skillStats(list)
    expect(st.map((s) => s.skill).slice(0, 3)).toEqual(['関係詞', '時制', '語彙'])
    expect(st[0]).toMatchObject({ n: 3, correct: 1, rate: 33, state: 'weak' })
    expect(st[2].state).toBe('good')
    expect(st.at(-1)!.state).toBe('untested')
    expect(st).toHaveLength(SKILLS.length)
    expect(overall(list)).toEqual({ n: 8, rate: 75 })
    expect(overall([])).toEqual({ n: 0, rate: null })
  })
  it('直近 20 問だけを見る', () => {
    const list = [...Array.from({ length: 20 }, (_, i) => ans('語彙', false, i)), ...Array.from({ length: 20 }, (_, i) => ans('語彙', true, i))]
    expect(skillStats(list).find((s) => s.skill === '語彙')!.rate).toBe(100)
    expect(addAnswers(list, [ans('語彙', true)], 10)).toHaveLength(10)
  })
})

describe('generateQuiz', () => {
  it('教材の英文を番号付きで送り、設問を保存する。結果も保存できる', async () => {
    const a = parseAnalysis(
      JSON.stringify({ sentences: ['He tried.', 'He gave up.'].map((en) => ({ en, ja: '', pattern: 'SV', parts: [{ text: en, role: 'S', note: '', inner: [] }], explanation: '', alt: [], grammar: [], hard: [], original: '', fixes: [] })) }),
      'en-ja',
      'He tried. He gave up.',
      'm',
    )
    await setKV('k-quiz', a)
    const m = newMaterial('mq', ['k-quiz'], [a])
    let sent = ''
    const t: Transport = {
      async send(req) {
        sent = req.text
        return { text: JSON.stringify({ questions: [q()] }), stopReason: 'end_turn', inputTokens: 1, outputTokens: 1 }
      },
    }
    const quiz = await generateQuiz(m, t)
    expect(sent).toBe('[0] He tried.\n[1] He gave up.')
    expect(quiz.questions[0].sentence).toBe(1)
    expect((await loadQuiz('mq'))!.questions).toHaveLength(1)
    await saveAnswers([{ materialId: 'mq', question: 0, skill: '語彙', correct: true, at: 1 }])
    expect(await loadAnswers()).toHaveLength(1)
  })
})
