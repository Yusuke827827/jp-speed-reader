// 英語学習モードの、画面にも通信にも依存しない道具。
//   - 単語帳の復習の予定（忘れる前に出す。箱を使う方式）
//   - 教材（取り込んだ文章）とフォルダ、音読・語彙の進み具合
//   - 長い文章を、AI に 1 回で送れる長さに分ける
//   - 構造の単位を 1 つずつ流して読むときの単位と表示時間
//   - 音読の採点（聞き取った語と英文の語を突き合わせる）
//   - 共有用の画像に描くときの行の折り返し

import { GRAMMAR, MAX_INPUT, type Analysis, type Direction, type Grammar, type Role, type Sentence, type VocabItem } from './study'

const DAY = 24 * 60 * 60 * 1000

// ---- 復習の予定 ----

/** 箱ごとの次の復習までの日数。正解するたびに次の箱へ進み、間が空いていく */
export const INTERVAL_DAYS = [0, 1, 3, 7, 14, 30, 60]
/** この箱まで来たら「覚えた」とみなす */
export const LEARNED_BOX = 5

export function boxOf(v: VocabItem): number {
  return v.box ?? 0
}

export function dueOf(v: VocabItem): number {
  return v.due ?? v.addedAt
}

/** 今日復習する単語（覚えた単語は除く）。期限の古い順 */
export function dueItems(list: VocabItem[], now = Date.now()): VocabItem[] {
  return list.filter((v) => !v.learned && dueOf(v) <= now).sort((a, b) => dueOf(a) - dueOf(b))
}

/** 復習の答えを記録する。正解なら次の箱へ、不正解なら最初の箱に戻して 10 分後にもう一度 */
export function review(v: VocabItem, correct: boolean, now = Date.now()): VocabItem {
  if (!correct) return { ...v, box: 0, due: now + 10 * 60 * 1000, learned: false, misses: (v.misses ?? 0) + 1 }
  const box = Math.min(boxOf(v) + 1, INTERVAL_DAYS.length - 1)
  return { ...v, box, due: now + INTERVAL_DAYS[box] * DAY, learned: box >= LEARNED_BOX }
}

export function applyReview(list: VocabItem[], id: string, correct: boolean, now = Date.now()): VocabItem[] {
  return list.map((v) => (v.id === id ? review(v, correct, now) : v))
}

// ---- 教材（取り込んだ文章 1 本ぶん）とフォルダ ----

/** 取り込んだ文章 1 本。長い文章は何回かに分けて解析するので、解析結果の保存場所を順に持つ */
export interface Material {
  id: string
  title: string
  direction: Direction
  folder: string
  createdAt: number
  /** 最後に開いた時刻（本棚の並び順） */
  openedAt: number
  /** 解析結果を保存した場所（kv のキー）。文章の順 */
  keys: string[]
  /** 文の数 */
  count: number
  grammar: Grammar[]
  /** 難しめの単語（見出しを小文字にしたもの）。語彙の進み具合に使う */
  hard: string[]
  /** 音読で合格した文の番号（教材の中の通し番号） */
  readOk: number[]
  /** 最後に読んでいた文の番号 */
  last: number
}

/** 音読の合格点 */
export const READ_PASS = 80

export function sentencesOf(analyses: Analysis[]): Sentence[] {
  return analyses.flatMap((a) => a.sentences)
}

export function newMaterial(id: string, keys: string[], analyses: Analysis[], folder = '', now = Date.now()): Material {
  const sentences = sentencesOf(analyses)
  const first = sentences[0]?.en ?? analyses[0]?.source ?? ''
  return {
    id,
    title: first.length > 60 ? `${first.slice(0, 58)}…` : first,
    direction: analyses[0]?.direction ?? 'en-ja',
    folder: folder.trim(),
    createdAt: now,
    openedAt: now,
    keys,
    count: sentences.length,
    grammar: [...new Set(sentences.flatMap((s) => s.grammar ?? []))],
    hard: [...new Set(sentences.flatMap((s) => (s.hard ?? []).map((h) => h.word.toLowerCase())))],
    readOk: [],
    last: 0,
  }
}

/** 本棚に加える・置き換える（新しいものを先頭に） */
export function putMaterial(list: Material[], m: Material): Material[] {
  return [m, ...list.filter((x) => x.id !== m.id)]
}

export function updateMaterial(list: Material[], id: string, patch: (m: Material) => Material): Material[] {
  return list.map((m) => (m.id === id ? patch(m) : m))
}

/** 音読の結果を記録する。合格なら、その文を合格の一覧に入れる */
export function recordReading(m: Material, index: number, score: number): Material {
  if (score < READ_PASS || m.readOk.includes(index)) return { ...m, last: index }
  return { ...m, readOk: [...m.readOk, index].sort((a, b) => a - b), last: index }
}

/** 教材の語彙の進み具合：難しめの単語のうち、単語帳に入っている数 */
export function vocabProgress(m: Material, vocab: VocabItem[]): { have: number; total: number } {
  const ids = new Set(vocab.flatMap((v) => [v.id, v.entry.word.toLowerCase()]))
  return { have: m.hard.filter((w) => ids.has(w)).length, total: m.hard.length }
}

export function folders(list: Material[]): string[] {
  return [...new Set(list.map((x) => x.folder).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'ja'))
}

/** 文法項目ごとの、出てきた教材の数（多い順） */
export function grammarCounts(list: Material[]): { grammar: Grammar; count: number }[] {
  const m = new Map<Grammar, number>()
  for (const e of list) for (const g of e.grammar) m.set(g, (m.get(g) ?? 0) + 1)
  return [...m.entries()].map(([grammar, count]) => ({ grammar, count })).sort((a, b) => b.count - a.count || GRAMMAR.indexOf(a.grammar) - GRAMMAR.indexOf(b.grammar))
}

// ---- 長い文章を分ける ----

/** 文の終わり（英語のピリオド類と日本語の句点）か改行で区切り、max 字以内のかたまりにまとめる */
export function splitForAnalysis(text: string, max = MAX_INPUT): string[] {
  const sentences = text
    .replace(/\r\n?/g, '\n')
    .split(/(?<=[.!?。！？])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean)
  const out: string[] = []
  let cur = ''
  const push = () => {
    if (cur) out.push(cur)
    cur = ''
  }
  for (let s of sentences) {
    // 1 文が長すぎるときは、空白の位置で切る
    while (s.length > max) {
      let cut = s.lastIndexOf(' ', max)
      if (cut <= 0) cut = max
      push()
      out.push(s.slice(0, cut).trim())
      s = s.slice(cut).trim()
    }
    // 日本語の文のあとは空白を入れずにつなぐ
    const sep = cur && !/[。！？]$/.test(cur) ? ' ' : ''
    if (cur && cur.length + sep.length + s.length > max) push()
    cur = cur ? cur + sep + s : s
  }
  push()
  return out
}

// ---- 流して読む ----

export interface FlowUnit {
  text: string
  role: Role
  /** 節の中の要素なら true（小文字で示す） */
  sub: boolean
  sentence: number
  /** 文の最後の単位 */
  end: boolean
}

export function wordCount(s: string): number {
  return s.split(/\s+/).filter((w) => /[A-Za-z0-9]/.test(w)).length
}

/** 構造の単位を順に並べる。長い節（7 語以上）は、節の中の要素に分けて流す */
export function flowUnits(sentences: Sentence[]): FlowUnit[] {
  const out: FlowUnit[] = []
  sentences.forEach((s, si) => {
    const units: FlowUnit[] = []
    for (const p of s.parts) {
      if (p.inner.length && wordCount(p.text) >= 7) for (const x of p.inner) units.push({ text: x.text, role: x.role, sub: true, sentence: si, end: false })
      else units.push({ text: p.text, role: p.role, sub: false, sentence: si, end: false })
    }
    if (units.length) units[units.length - 1].end = true
    out.push(...units)
  })
  return out
}

/** 1 単位を出しておく時間（ミリ秒）。語数 ÷ 語/分 に、文末なら少し間を足す。短すぎないよう下限を置く */
export function unitMs(u: FlowUnit, wpm: number): number {
  const words = Math.max(1, wordCount(u.text))
  return Math.max(280, Math.round((words / wpm) * 60000)) + (u.end ? 450 : 0)
}

// ---- 音読の採点 ----

export function words(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .split(/[^a-z0-9']+/)
    .map((w) => w.replace(/^'+|'+$/g, ''))
    .filter(Boolean)
}

/** 英文の語ごとに、聞き取れたかを返す（最長共通部分列で並びを突き合わせる）。score は 0〜100 */
export function scoreReading(target: string, heard: string): { score: number; words: { word: string; ok: boolean }[] } {
  const a = words(target)
  const b = words(heard)
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
  const ok = new Array<boolean>(a.length).fill(false)
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      ok[i] = true
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) i++
    else j++
  }
  const hit = ok.filter(Boolean).length
  return { score: a.length ? Math.round((hit / a.length) * 100) : 0, words: a.map((word, k) => ({ word, ok: ok[k] })) }
}

// ---- 共有画像の折り返し ----

export interface LaidSeg {
  text: string
  role: Role
  x: number
  width: number
}

/** 要素を左から並べ、幅に収まらなければ次の行へ送る。1 つの要素が幅より長いときは語の境目で分ける */
export function layoutParts(parts: { text: string; role: Role }[], measure: (s: string) => number, maxWidth: number, gap: number): LaidSeg[][] {
  const lines: LaidSeg[][] = [[]]
  let x = 0
  const place = (text: string, role: Role) => {
    const w = measure(text)
    if (x > 0 && x + w > maxWidth) {
      lines.push([])
      x = 0
    }
    lines[lines.length - 1].push({ text, role, x, width: w })
    x += w + gap
  }
  for (const p of parts) {
    if (measure(p.text) <= maxWidth) {
      place(p.text, p.role)
      continue
    }
    let buf = ''
    for (const w of p.text.split(' ')) {
      const next = buf ? `${buf} ${w}` : w
      if (buf && measure(next) > maxWidth) {
        place(buf, p.role)
        buf = w
      } else buf = next
    }
    if (buf) place(buf, p.role)
  }
  return lines.filter((l) => l.length)
}
