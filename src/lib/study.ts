// 英語学習モード：英文の構造（S・V・O・C・M）と訳、単語の詳しい説明、単語帳。
// AI の呼び出しそのものは studyAi.ts。ここは画面にも通信にも依存しない部分で、テストで確かめる。
//
// モードは 3 つ。
//   ja-en: 日本語の文 → 自然な英語に直し、その英語に S・V・O・C を振る（訳は元の日本語に近い形で付ける）
//   en-ja: 英語の文 → そのまま S・V・O・C を振り、日本語に訳す
//   fix:   利用者が書いた英文 → 直した英文に S・V・O・C を振り、直した箇所と理由を付ける（英作文の添削）
// どれも「英文に印を付けたもの＋日本語訳」という同じ形で返す。

export type Direction = 'ja-en' | 'en-ja' | 'fix'

/** 文法項目（学校文法の呼び方）。文ごとに AI が選び、文法ごとに例文を集めるのに使う */
export const GRAMMAR = [
  '現在完了',
  '過去完了',
  '進行形',
  '受動態',
  '助動詞',
  '不定詞',
  '動名詞',
  '分詞',
  '分詞構文',
  '関係代名詞',
  '関係副詞',
  '比較',
  '仮定法',
  '接続詞',
  '名詞節',
  '間接疑問',
  '形式主語・形式目的語',
  '強調構文',
  '倒置',
  '使役・知覚動詞',
  '句動詞',
  '疑問文',
  '命令文',
  '否定',
] as const
export type Grammar = (typeof GRAMMAR)[number]

/** 単語の難しさ（CEFR）。英検の目安は英検協会が示す CEFR との対応（3級=A1 … 1級=C1） */
export const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const
export type Level = (typeof LEVELS)[number]
export const EIKEN: Record<Level, string> = { A1: '3級', A2: '準2級', B1: '2級', B2: '準1級', C1: '1級', C2: '1級以上' }

/** 難しい単語として拾う下限（これ以上を単語帳の候補にする） */
export const HARD_FROM: Level = 'B1'

export function levelAtLeast(l: Level, min: Level): boolean {
  return LEVELS.indexOf(l) >= LEVELS.indexOf(min)
}

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
  /** この文に出てくる文法項目 */
  grammar: Grammar[]
  /** 難しめの単語（学習者が知らなさそうなもの）とその難しさ */
  hard: { word: string; level: Level }[]
  /** 添削：元の文（直す前） */
  original: string
  /** 添削：直した箇所 */
  fixes: { before: string; after: string; reason: string }[]
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
        required: ['en', 'ja', 'pattern', 'parts', 'explanation', 'alt', 'grammar', 'hard', 'original', 'fixes'],
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
          grammar: { type: 'array', items: { type: 'string', enum: [...GRAMMAR] } },
          hard: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['word', 'level'],
              properties: { word: { type: 'string' }, level: { type: 'string', enum: [...LEVELS] } },
            },
          },
          original: { type: 'string' },
          fixes: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['before', 'after', 'reason'],
              properties: { before: { type: 'string' }, after: { type: 'string' }, reason: { type: 'string' } },
            },
          },
        },
      },
    },
  },
} as const

/** 変えたら上げる。保存してある解析結果を使い回さないようにする */
export const PROMPT_VERSION = 2

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
    direction === 'fix'
      ? `The user gives English they wrote themselves (a Japanese learner, e.g. for an Eiken or university entrance writing task). For each sentence, write a corrected version in "en" that fixes grammar, word choice and unnatural phrasing while keeping the writer's meaning and level (do not rewrite into something much more advanced). Put the writer's original sentence, exactly as written, in "original". List each change in "fixes" with the original words ("before"), the corrected words ("after") and a short Japanese "reason". If a sentence is already correct and natural, copy it unchanged and leave "fixes" []. "ja" is a Japanese translation of the corrected sentence. "alt" holds 1 more natural or more advanced way to say it, or [].`
      : direction === 'ja-en'
        ? `The user gives Japanese text. Translate it into natural English that a native speaker would actually write (not a word-for-word translation), one English sentence per item. "ja" is the part of the original Japanese that the sentence corresponds to. "alt" holds 1-2 other natural English ways to say it (different register or structure), or [] if none is useful.`
      : `The user gives English text. Keep every English sentence exactly as written (do not fix or change it), one sentence per item. "ja" is a natural Japanese translation. "alt" holds 1-2 other Japanese translations (e.g. a more literal one that follows the English structure, or a more casual one), or [] if none is useful.`
  const extra = direction === 'fix' ? '' : `\n"original" is "" and "fixes" is [] (they are only used for corrections).`
  return `You help Japanese learners of English see sentence structure.
${task}

For each English sentence, split it into "parts" in order. Joining the "text" of all parts with single spaces must reproduce the English sentence exactly (same words, same punctuation, same order). Attach punctuation to the neighbouring part.
${ROLE_GUIDE}
"pattern" is the sentence pattern of the main clause (SV, SVC, SVO, SVOO, SVOC), or "other" for fragments, questions you cannot classify, or imperatives without a clear pattern.
"note" is a very short Japanese hint for a part when useful (e.g. "現在完了", "to不定詞の名詞的用法", "関係代名詞 which"), else "".
"explanation" is 1-2 short Japanese sentences explaining the structure for a high-school learner.
"grammar" lists the grammar points from the allowed list that appear in the sentence (most important first, up to 4), or [].
"hard" lists words in the English sentence a Japanese high-school learner may not know, with their CEFR level (B1 or above only; skip proper nouns), or [].${extra}`
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
      grammar: (Array.isArray(r.grammar) ? r.grammar : []).filter((g): g is Grammar => GRAMMAR.includes(g as Grammar)),
      hard: (Array.isArray(r.hard) ? r.hard : [])
        .map((h) => ({ word: str((h as Record<string, unknown>).word), level: (h as Record<string, unknown>).level as Level }))
        .filter((h) => h.word && LEVELS.includes(h.level)),
      original: direction === 'fix' ? str(r.original) : '',
      fixes:
        direction === 'fix'
          ? (Array.isArray(r.fixes) ? r.fixes : [])
              .map((f) => ({ before: str((f as Record<string, unknown>).before), after: str((f as Record<string, unknown>).after), reason: str((f as Record<string, unknown>).reason) }))
              .filter((f) => f.before || f.after)
          : [],
      checked: false,
    }
    // en-ja では英文が元の文に、添削では「直す前の文」が元の文に含まれているかも見る（AI が書き換えていないか）
    const kept = direction === 'ja-en' || (direction === 'fix' ? squash(source).includes(squash(s.original)) : squash(source).includes(squash(s.en)))
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
  /** 難しさ（CEFR） */
  level: Level | ''
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
  required: ['word', 'lemma', 'ipa', 'level', 'sense', 'meanings', 'synonyms', 'examples'],
  properties: {
    word: { type: 'string' },
    lemma: { type: 'string' },
    ipa: { type: 'string' },
    level: { type: 'string', enum: [...LEVELS] },
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
- "level": the CEFR level of the lemma in this sense (A1-C2)
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
    level: LEVELS.includes(d.level as Level) ? (d.level as Level) : '',
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
  /** 復習の箱（0 から。正解するたびに 1 つ進む）。古い版の単語には無い */
  box?: number
  /** 次に復習する時刻 */
  due?: number
  /** 間違えた回数 */
  misses?: number
}

export function vocabId(lemma: string): string {
  return lemma.trim().toLowerCase()
}

/** 単語帳に加える。すでにあれば、説明と文を新しくして先頭に移す（覚えた印は外す） */
export function addVocab(list: VocabItem[], entry: WordEntry, context: string, now = Date.now()): VocabItem[] {
  const id = vocabId(entry.lemma)
  const rest = list.filter((v) => v.id !== id)
  return [{ id, entry, context, addedAt: now, learned: false, box: 0, due: now }, ...rest]
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
