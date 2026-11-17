// 英語学習モード：英文の構造（S・V・O・C・M）と訳、単語の詳しい説明、単語帳。
// AI の呼び出しそのものは studyAi.ts。ここは画面にも通信にも依存しない部分で、テストで確かめる。
//
// 方向は 2 つ。
//   ja-en: 日本語の文 → 自然な英語に直し、その英語に S・V・O・C を振る（訳は元の日本語に近い形で付ける）
//   en-ja: 英語の文 → そのまま S・V・O・C を振り、日本語に訳す
// どちらも「英文に印を付けたもの＋日本語訳」という同じ形で返す。

export type Direction = 'ja-en' | 'en-ja'

/** 文の要素。S 主語・V 動詞・O 目的語・C 補語・M 修飾語・X それ以外（接続詞・間投詞・句読点など） */
export type Role = 'S' | 'V' | 'O' | 'C' | 'M' | 'X'
export const ROLES: readonly Role[] = ['S', 'V', 'O', 'C', 'M', 'X']

export type Pattern = 'SV' | 'SVC' | 'SVO' | 'SVOO' | 'SVOC' | 'other'
export const PATTERNS: readonly Pattern[] = ['SV', 'SVC', 'SVO', 'SVOO', 'SVOC', 'other']

/** 節の中の要素（2 段目） */
export interface InnerPart {
  text: string
  role: Role
}

export interface Part {
  text: string
  role: Role
  /** この要素についての短い説明（日本語）。無ければ空 */
  note: string
  /** この要素が節（that 節・関係詞節・不定詞句など）なら、その中の要素。そうでなければ空 */
  inner: InnerPart[]
}

export interface Sentence {
  /** 英文（ja-en では AI が作った英文、en-ja では元の英文） */
  en: string
  /** 日本語訳（ja-en では元の日本語に当たる部分） */
  ja: string
  pattern: Pattern
  parts: Part[]
  /** 構造の説明（日本語） */
  explanation: string
  /** 別の言い方（ja-en では別の英文、en-ja では別の日本語訳） */
  alt: string[]
  /** 区切りが元の文と一致したか（AI が文字を書き換えていないか） */
  checked: boolean
}

export interface Analysis {
  direction: Direction
  source: string
  sentences: Sentence[]
  model: string
  createdAt: number
}

// ---- AI に渡す返事の形（JSON スキーマ） ----

const roleEnum = { type: 'string', enum: [...ROLES] }

export const ANALYSIS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['sentences'],
  properties: {
    sentences: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['en', 'ja', 'pattern', 'parts', 'explanation', 'alt'],
        properties: {
          en: { type: 'string' },
          ja: { type: 'string' },
          pattern: { type: 'string', enum: [...PATTERNS] },
          parts: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['text', 'role', 'note', 'inner'],
              properties: {
                text: { type: 'string' },
                role: roleEnum,
                note: { type: 'string' },
                inner: {
                  type: 'array',
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['text', 'role'],
                    properties: { text: { type: 'string' }, role: roleEnum },
                  },
                },
              },
            },
          },
          explanation: { type: 'string' },
          alt: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
} as const

/** 変えたら上げる。保存してある解析結果を使い回さないようにする */
export const PROMPT_VERSION = 1

const ROLE_GUIDE = `Roles (traditional Japanese school grammar, 5 sentence patterns / 五文型):
- S: subject (the whole noun phrase, e.g. "The tall man in the hat")
- V: the full verb phrase including auxiliaries, negation and phrasal particles (e.g. "has not been", "gave up")
- O: object (both objects in SVOO are separate O parts)
- C: complement (subject or object complement)
- M: modifier (adverbs, adverbial phrases and clauses, prepositional phrases that modify the verb or the sentence)
- X: anything else (conjunctions joining clauses, interjections, "there" in "there is", punctuation-only pieces)
A relative clause stays inside the noun phrase it modifies (it is part of that S, O or C, not a separate part).
When a part is a noun clause (that-/wh-/if-clause), an adverbial clause, or an infinitive or gerund phrase, fill "inner" with that clause's own S/V/O/C/M breakdown in order. Otherwise "inner" is [].`

export function systemPrompt(direction: Direction): string {
  const task =
    direction === 'ja-en'
      ? `The user gives Japanese text. Translate it into natural English that a native speaker would actually write (not a word-for-word translation), one English sentence per item. "ja" is the part of the original Japanese that the sentence corresponds to. "alt" holds 1-2 other natural English ways to say it (different register or structure), or [] if none is useful.`
      : `The user gives English text. Keep every English sentence exactly as written (do not fix or change it), one sentence per item. "ja" is a natural Japanese translation. "alt" holds 1-2 other Japanese translations (e.g. a more literal one that follows the English structure, or a more casual one), or [] if none is useful.`
  return `You help Japanese learners of English see sentence structure.
${task}

For each English sentence, split it into "parts" in order. Joining the "text" of all parts with single spaces must reproduce the English sentence exactly (same words, same punctuation, same order). Attach punctuation to the neighbouring part.
${ROLE_GUIDE}
"pattern" is the sentence pattern of the main clause (SV, SVC, SVO, SVOO, SVOC), or "other" for fragments, questions you cannot classify, or imperatives without a clear pattern.
"note" is a very short Japanese hint for a part when useful (e.g. "現在完了", "to不定詞の名詞的用法", "関係代名詞 which"), else "".
"explanation" is 1-2 short Japanese sentences explaining the structure for a high-school learner.`
}

export function analysisRequestText(text: string): string {
  return text.trim()
}

// ---- 返事の検証 ----

/** 空白の違いを無視して比べるための形 */
export function squash(s: string): string {
  return s.replace(/\s+/g, '').replace(/[’‘]/g, "'").replace(/[“”]/g, '"')
}

/** parts をつなぐと英文に戻るか。inner があれば、それをつなぐと part に戻るか */
export function partsMatch(s: Pick<Sentence, 'en' | 'parts'>): boolean {
  if (!s.parts.length) return false
  if (squash(s.parts.map((p) => p.text).join(' ')) !== squash(s.en)) return false
  return s.parts.every((p) => !p.inner.length || squash(p.inner.map((x) => x.text).join(' ')) === squash(p.text))
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

function role(v: unknown): Role {
  return ROLES.includes(v as Role) ? (v as Role) : 'X'
}

/** AI の返事（JSON 文字列）を解析結果にする。形が違えば例外 */
export function parseAnalysis(json: string, direction: Direction, source: string, model: string, now = Date.now()): Analysis {
  let data: unknown
  try {
    data = JSON.parse(json)
  } catch {
    throw new Error('bad-json')
  }
  const list = (data as { sentences?: unknown })?.sentences
  if (!Array.isArray(list) || !list.length) throw new Error('bad-json')
  const sentences: Sentence[] = list.map((raw) => {
    const r = raw as Record<string, unknown>
    const parts: Part[] = (Array.isArray(r.parts) ? r.parts : []).map((p) => {
      const q = p as Record<string, unknown>
      return {
        text: str(q.text),
        role: role(q.role),
        note: str(q.note),
        inner: (Array.isArray(q.inner) ? q.inner : []).map((x) => ({ text: str((x as InnerPart).text), role: role((x as InnerPart).role) })),
      }
    })
    const s = {
      en: str(r.en),
      ja: str(r.ja),
      pattern: PATTERNS.includes(r.pattern as Pattern) ? (r.pattern as Pattern) : 'other',
      parts,
      explanation: str(r.explanation),
      alt: (Array.isArray(r.alt) ? r.alt : []).map(str).filter(Boolean),
      checked: false,
    }
    // en-ja では、英文が元の文に含まれているかも見る（AI が英文を書き換えていないか）
    const kept = direction === 'ja-en' || squash(source).includes(squash(s.en))
    s.checked = kept && partsMatch(s)
    return s
  })
  return { direction, source, sentences, model, createdAt: now }
}

// ---- 単語 ----

export interface WordEntry {
  /** 文中の形 */
  word: string
  /** 辞書の見出しの形 */
  lemma: string
  ipa: string
  /** この文での意味（日本語） */
  sense: string
  /** ほかの日本語訳（品詞ごと） */
  meanings: { pos: string; ja: string }[]
  synonyms: { word: string; ja: string; nuance: string }[]
  examples: { en: string; ja: string }[]
}

export const WORD_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['word', 'lemma', 'ipa', 'sense', 'meanings', 'synonyms', 'examples'],
  properties: {
    word: { type: 'string' },
    lemma: { type: 'string' },
    ipa: { type: 'string' },
    sense: { type: 'string' },
    meanings: {
      type: 'array',
      items: { type: 'object', additionalProperties: false, required: ['pos', 'ja'], properties: { pos: { type: 'string' }, ja: { type: 'string' } } },
    },
    synonyms: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['word', 'ja', 'nuance'],
        properties: { word: { type: 'string' }, ja: { type: 'string' }, nuance: { type: 'string' } },
      },
    },
    examples: {
      type: 'array',
      items: { type: 'object', additionalProperties: false, required: ['en', 'ja'], properties: { en: { type: 'string' }, ja: { type: 'string' } } },
    },
  },
} as const

export const WORD_SYSTEM = `You are an English-Japanese learner's dictionary for Japanese students.
Given an English word and the sentence it appears in, return:
- "word": the word as it appears; "lemma": its dictionary form (e.g. "ran" -> "run"; keep phrasal verbs like "give up" if the user selected them)
- "ipa": American IPA in slashes, e.g. "/rʌn/"
- "sense": the Japanese meaning in THIS sentence, short
- "meanings": the other common Japanese translations, grouped by part of speech ("pos" in Japanese, e.g. "動詞", "名詞"), most common first, up to 6
- "synonyms": up to 4 English synonyms, each with a Japanese gloss and a short Japanese note on how it differs in nuance or usage
- "examples": 3 short natural example sentences with Japanese translations, using the word in the same sense first, then other common senses
Write all explanations in Japanese.`

export function wordRequestText(word: string, sentence: string): string {
  return `Word: ${word.trim()}\nSentence: ${sentence.trim()}`
}

export function parseWord(json: string): WordEntry {
  let d: Record<string, unknown>
  try {
    d = JSON.parse(json)
  } catch {
    throw new Error('bad-json')
  }
  const arr = (v: unknown) => (Array.isArray(v) ? v : []) as Record<string, unknown>[]
  const w: WordEntry = {
    word: str(d.word),
    lemma: str(d.lemma) || str(d.word),
    ipa: str(d.ipa),
    sense: str(d.sense),
    meanings: arr(d.meanings).map((m) => ({ pos: str(m.pos), ja: str(m.ja) })).filter((m) => m.ja),
    synonyms: arr(d.synonyms).map((m) => ({ word: str(m.word), ja: str(m.ja), nuance: str(m.nuance) })).filter((m) => m.word),
    examples: arr(d.examples).map((m) => ({ en: str(m.en), ja: str(m.ja) })).filter((m) => m.en),
  }
  if (!w.lemma) throw new Error('bad-json')
  return w
}

/** 英文を、押せる単語とそれ以外（空白・記号）に分ける */
export function tokenize(text: string): { text: string; word: boolean }[] {
  const out: { text: string; word: boolean }[] = []
  for (const m of text.matchAll(/[A-Za-z]+(?:['’][A-Za-z]+)*(?:-[A-Za-z]+)*|[^A-Za-z]+/g)) {
    out.push({ text: m[0], word: /^[A-Za-z]/.test(m[0]) })
  }
  return out
}

// ---- 単語帳 ----

export interface VocabItem {
  /** 見出し語を小文字にしたもの（重複を防ぐ） */
  id: string
  entry: WordEntry
  /** 出会った文 */
  context: string
  addedAt: number
  learned: boolean
}

export function vocabId(lemma: string): string {
  return lemma.trim().toLowerCase()
}

/** 単語帳に加える。すでにあれば、説明と文を新しくして先頭に移す（覚えた印は外す） */
export function addVocab(list: VocabItem[], entry: WordEntry, context: string, now = Date.now()): VocabItem[] {
  const id = vocabId(entry.lemma)
  const rest = list.filter((v) => v.id !== id)
  return [{ id, entry, context, addedAt: now, learned: false }, ...rest]
}

export function removeVocab(list: VocabItem[], id: string): VocabItem[] {
  return list.filter((v) => v.id !== id)
}

export function toggleLearned(list: VocabItem[], id: string): VocabItem[] {
  return list.map((v) => (v.id === id ? { ...v, learned: !v.learned } : v))
}

export function searchVocab(list: VocabItem[], q: string): VocabItem[] {
  const w = q.trim().toLowerCase()
  if (!w) return list
  return list.filter(
    (v) =>
      v.id.includes(w) ||
      v.entry.word.toLowerCase().includes(w) ||
      v.entry.sense.includes(w) ||
      v.entry.meanings.some((m) => m.ja.includes(w)),
  )
}

// ---- 保存（同じ文を何度も AI に送らない） ----

/** 文字列の短い指紋（FNV-1a 32bit を 2 回。暗号用ではない） */
export function fingerprint(s: string): string {
  let h1 = 0x811c9dc5
  let h2 = 0x01000193
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0
    h2 = Math.imul(h2 ^ c, 0x5bd1e995) >>> 0
  }
  return h1.toString(36) + h2.toString(36)
}

export function analysisCacheKey(direction: Direction, text: string, model: string): string {
  return `study:a:${fingerprint([PROMPT_VERSION, direction, model, text.trim()].join('\n'))}`
}

export function wordCacheKey(word: string, sentence: string, model: string): string {
  return `study:w:${fingerprint([PROMPT_VERSION, model, word.trim().toLowerCase(), sentence.trim()].join('\n'))}`
}

/** 入力の上限（長すぎる文は 1 回で送らない） */
export const MAX_INPUT = 1200

// ---- 料金の目安 ----

/** 100 万トークンあたりのドル（入力・出力）。Anthropic の公開価格（2026-11 時点） */
export const MODELS = {
  'claude-opus-5-5': { label: 'Claude Opus 5.5', input: 4, output: 20 },
  'claude-haiku-5-5': { label: 'Claude Haiku 5.5', input: 0.1, output: 0.5 },
} as const
export type StudyModel = keyof typeof MODELS
export const DEFAULT_MODEL: StudyModel = 'claude-opus-5-5'

export function costUsd(model: string, inputTokens: number, outputTokens: number): number {
  const m = MODELS[model as StudyModel]
  if (!m) return 0
  return (inputTokens * m.input + outputTokens * m.output) / 1e6
}
