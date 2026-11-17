// 教材から試験形式の設問を作り、解いた結果から弱点を分析する。
// 設問は AI が教材の英文から作る（共通テスト・二次試験の読解でよく問われる形）。
// 分析は「力」ごとに直近の正答率を出す。答えた設問が無い力は「未測定」。

import type { Grammar } from './study'

/** 測る力。設問ごとに 1 つ付ける */
export const SKILLS = ['関係詞', '準動詞', '無生物主語', '時制', '比較・省略', '指示語', '語彙', '内容理解'] as const
export type Skill = (typeof SKILLS)[number]

/** 力ごとの説明（分析の画面に出す） */
export const SKILL_NOTES: Record<Skill, string> = {
  関係詞: '先行詞と関係詞節の範囲をつかむ。which の先行詞を外すと訳が崩れる',
  準動詞: '不定詞・動名詞・分詞のかかり方。長い主語の切れ目の目印になる',
  無生物主語: '物や事が主語の文を、原因・理由に読み替えて自然に訳す',
  時制: '完了形・進行形・過去完了で、出来事の前後関係をつかむ',
  '比較・省略': 'than や as の後ろで省略された語を補って比べる',
  指示語: 'it・this・they などが指す内容を前の文から見つける',
  語彙: '文脈から語の意味を決める。多義語は前後で意味が変わる',
  内容理解: '段落の要旨・筆者の主張・本文と合う選択肢を選ぶ',
}

/** 力に関係する文法項目（分析から、教材の例文を見に行く先） */
export const SKILL_GRAMMAR: Partial<Record<Skill, Grammar>> = {
  関係詞: '関係代名詞',
  準動詞: '不定詞',
  時制: '現在完了',
  '比較・省略': '比較',
}

export type QuestionType = 'meaning' | 'translation' | 'reference' | 'content'

export interface Question {
  /** 設問文（日本語） */
  prompt: string
  /** 設問が指す英文の一部（下線部など）。無ければ空 */
  quote: string
  choices: string[]
  /** 正解の番号（0 始まり） */
  answer: number
  /** 解説（日本語） */
  explanation: string
  skill: Skill
  type: QuestionType
  /** 根拠の文（教材の中の通し番号、0 始まり）。分からなければ -1 */
  sentence: number
}

export interface Quiz {
  materialId: string
  questions: Question[]
  model: string
  createdAt: number
}

export const QUIZ_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['questions'],
  properties: {
    questions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['prompt', 'quote', 'choices', 'answer', 'explanation', 'skill', 'type', 'sentence'],
        properties: {
          prompt: { type: 'string' },
          quote: { type: 'string' },
          choices: { type: 'array', items: { type: 'string' } },
          answer: { type: 'integer' },
          explanation: { type: 'string' },
          skill: { type: 'string', enum: [...SKILLS] },
          type: { type: 'string', enum: ['meaning', 'translation', 'reference', 'content'] },
          sentence: { type: 'integer' },
        },
      },
    },
  },
} as const

/** 1 回に作る設問の数 */
export const QUIZ_SIZE = 6
/** 設問を作るときに AI に渡す本文の上限（字） */
export const QUIZ_MAX_TEXT = 8000

export const QUIZ_SYSTEM = `You write English reading-comprehension questions for Japanese high-school students preparing for university entrance exams (the Common Test and second-stage exams).
The user gives a passage as numbered English sentences ("[0] ...", "[1] ...").
Write ${QUIZ_SIZE} multiple-choice questions about THIS passage only, each with exactly 4 choices and one correct answer. Mix these types:
- "translation": the best Japanese translation of a quoted part of a sentence (tests structure: relative clauses, verbals, inanimate subjects, tense, comparison/ellipsis)
- "meaning": the meaning of a quoted word or phrase in this context (choices in Japanese)
- "reference": what a quoted pronoun or demonstrative refers to (choices in Japanese)
- "content": which statement agrees with the passage, or the main point (choices in Japanese)
Rules:
- "prompt" is the question in Japanese, e.g. "下線部の意味として最も適切なものを選べ。"
- "quote" is the exact English words from the passage the question is about (copy them exactly), or "" for content questions.
- Wrong choices must be plausible mistakes a learner would make (e.g. attaching a relative clause to the wrong noun), not silly.
- "answer" is the 0-based index of the correct choice. Vary its position.
- "explanation" is 1-3 short Japanese sentences explaining why the answer is right and why the tempting wrong choice is wrong.
- "skill" is the main ability tested, from the allowed list. Use structure skills for translation questions whenever they apply.
- "sentence" is the number of the sentence that holds the evidence, or -1.
Only ask about what the passage actually says.`

/** 教材の英文を、番号付きの本文にする（長すぎる分は落とす） */
export function quizRequestText(sentences: string[]): string {
  const lines: string[] = []
  let len = 0
  for (let i = 0; i < sentences.length; i++) {
    const line = `[${i}] ${sentences[i]}`
    if (len + line.length > QUIZ_MAX_TEXT) break
    lines.push(line)
    len += line.length + 1
  }
  return lines.join('\n')
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

/** AI の返事を設問にする。選択肢が 4 つでない・正解の番号が範囲外のものは捨てる */
export function parseQuiz(json: string, materialId: string, model: string, sentenceCount: number, now = Date.now()): Quiz {
  let d: unknown
  try {
    d = JSON.parse(json)
  } catch {
    throw new Error('bad-json')
  }
  const list = (d as { questions?: unknown })?.questions
  if (!Array.isArray(list)) throw new Error('bad-json')
  const questions: Question[] = []
  for (const raw of list) {
    const r = raw as Record<string, unknown>
    const choices = Array.isArray(r.choices) ? r.choices.map(str) : []
    const answer = typeof r.answer === 'number' ? r.answer : -1
    if (choices.length !== 4 || choices.some((c) => !c.trim()) || answer < 0 || answer > 3 || !str(r.prompt)) continue
    if (new Set(choices).size !== 4) continue
    const sentence = typeof r.sentence === 'number' && r.sentence >= 0 && r.sentence < sentenceCount ? r.sentence : -1
    questions.push({
      prompt: str(r.prompt),
      quote: str(r.quote),
      choices,
      answer,
      explanation: str(r.explanation),
      skill: SKILLS.includes(r.skill as Skill) ? (r.skill as Skill) : '内容理解',
      type: (['meaning', 'translation', 'reference', 'content'] as const).includes(r.type as QuestionType) ? (r.type as QuestionType) : 'content',
      sentence,
    })
  }
  if (!questions.length) throw new Error('bad-json')
  return { materialId, questions, model, createdAt: now }
}

// ---- 解いた結果と分析 ----

export interface Answer {
  materialId: string
  /** 設問の番号（同じ教材の設問の中で） */
  question: number
  skill: Skill
  correct: boolean
  at: number
}

/** 結果を足す。古いものから捨てて上限に収める */
export function addAnswers(list: Answer[], add: Answer[], max = 2000): Answer[] {
  return [...list, ...add].slice(-max)
}

export type SkillState = 'untested' | 'weak' | 'practice' | 'good'

export interface SkillStat {
  skill: Skill
  /** 直近の答えの数 */
  n: number
  correct: number
  /** 正答率 0〜100（n が 0 なら null） */
  rate: number | null
  state: SkillState
}

/** 力ごとに見る直近の答えの数 */
export const RECENT = 20
/** これより少ない答えでは「得意」「苦手」を決めない */
export const MIN_ANSWERS = 3

export function stateOf(n: number, rate: number | null): SkillState {
  if (!n || rate === null) return 'untested'
  if (n < MIN_ANSWERS) return 'practice'
  if (rate >= 80) return 'good'
  if (rate < 60) return 'weak'
  return 'practice'
}

/** 力ごとの直近の正答率。苦手なものから並べ、未測定は最後 */
export function skillStats(answers: Answer[]): SkillStat[] {
  const order: Record<SkillState, number> = { weak: 0, practice: 1, good: 2, untested: 3 }
  return SKILLS.map((skill) => {
    const recent = answers.filter((a) => a.skill === skill).slice(-RECENT)
    const correct = recent.filter((a) => a.correct).length
    const rate = recent.length ? Math.round((correct / recent.length) * 100) : null
    return { skill, n: recent.length, correct, rate, state: stateOf(recent.length, rate) }
  }).sort((a, b) => order[a.state] - order[b.state] || (a.rate ?? 101) - (b.rate ?? 101) || SKILLS.indexOf(a.skill) - SKILLS.indexOf(b.skill))
}

export function overall(answers: Answer[]): { n: number; rate: number | null } {
  if (!answers.length) return { n: 0, rate: null }
  return { n: answers.length, rate: Math.round((answers.filter((a) => a.correct).length / answers.length) * 100) }
}
