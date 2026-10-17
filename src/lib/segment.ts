// 日本語の本文を、高速読書で 1 回に表示する単位（チャンク）に分ける。
//
// 1. 段落を文に分ける（。！？ と、それに続く閉じ括弧で区切る）
// 2. 文を BudouX で文節相当の単位に分ける
// 3. モードに合わせて、短い文節はつなぎ、長い文節は字種の境目で切る
//
// 数字・英単語・三点リーダー・ダッシュの連続は途中で切らない。
// 開き括弧は後ろに、閉じ括弧と句読点は前にくっつける。

import { loadDefaultJapaneseParser } from 'budoux'
import type { BookText, Illust, TextPosition } from './book'

export type ChunkMode = 'char' | 'short' | 'phrase' | 'bunsetsu' | 'sentence'

export const CHUNK_MODES: { id: ChunkMode; label: string; hint: string }[] = [
  { id: 'char', label: '1文字', hint: '1文字ずつ（句読点は前の文字と一緒）' },
  { id: 'short', label: '2〜4文字', hint: '文節を4文字以内に収める' },
  { id: 'bunsetsu', label: '文節', hint: 'BudouXの文節単位' },
  { id: 'phrase', label: 'フレーズ', hint: '短い文節をつないで目標の長さに' },
  { id: 'sentence', label: '文', hint: '1文ずつ（長い文は読点で分ける）' },
]

export type Pause = 'none' | 'comma' | 'sentence' | 'paragraph'

export interface Chunk {
  text: string
  para: number
  /** 段落内の開始・終了文字位置 */
  start: number
  end: number
  pause: Pause
  /** 表示上の文字数（空白を除く） */
  len: number
  /** 欧文の単位の語数。速度を WPM で合わせるのに使う（日本語の単位には無い） */
  words?: number
  /** 登録した人物名を含む */
  name?: boolean
  /** 挿絵（本文は空） */
  illust?: Illust
}

export interface SegmentOptions {
  mode: ChunkMode
  /** フレーズモードの目標文字数 */
  phraseTarget: number
  /** これより短い単位は、同じ文の隣の単位とつなぐ（1 なら何もしない） */
  minChars?: number
  /** 途中で切らない語（人物名など） */
  names?: string[]
}

let parser: ReturnType<typeof loadDefaultJapaneseParser> | null = null
function budoux() {
  parser ??= loadDefaultJapaneseParser()
  return parser
}

const OPEN = '「『（(【〈《〔［[｛{“‘'
const CLOSE = '」』）)】〉》〕］]｝}”’'
const SENT_END = '。！？!?．'
const COMMA = '、，,'
// 欧文で、ピリオドが付いても文の終わりではない略語（小文字で比べる）
const ABBREVIATIONS = new Set([
  'mr', 'mrs', 'ms', 'dr', 'prof', 'sr', 'jr', 'st', 'mt', 'vs', 'etc', 'fig', 'figs', 'eq', 'eqs', 'no', 'nos',
  'vol', 'vols', 'pp', 'p', 'al', 'cf', 'approx', 'inc', 'ltd', 'co', 'corp', 'dept', 'univ', 'ed', 'eds',
  'jan', 'feb', 'mar', 'apr', 'jun', 'jul', 'aug', 'sep', 'sept', 'oct', 'nov', 'dec', 'sec', 'ch', 'ref', 'refs',
])

/** text[i] の「.」が欧文の文の終わりか。略語・頭文字・小数・次が小文字のものは除く */
function isLatinSentenceEnd(text: string, i: number): boolean {
  const next = text[i + 1]
  if (next !== undefined && !/[\s"'’”)\]]/.test(next)) return false // 小数（12.5）や e.g の途中
  let w = i
  while (w > 0 && /[A-Za-z.]/.test(text[w - 1])) w--
  const word = text.slice(w, i)
  if (!/[A-Za-z]/.test(word)) return /[0-9]$/.test(text.slice(0, i)) // 数字の後（1999.）は文末
  if (word.includes('.')) return false // e.g. / p.m. / U.S.
  if (/^[A-Z]$/.test(word)) return false // 頭文字（J. R. Tolkien）
  if (ABBREVIATIONS.has(word.toLowerCase())) return false
  const after = text.slice(i + 1).match(/^[\s"'’”)\]]*(\S)/)
  return !after || !/[a-z]/.test(after[1]) // 次の文が小文字で始まるなら文の途中
}

/** 英単語の中のアポストロフィ（don’t）は閉じ括弧として数えない */
const isApostrophe = (text: string, i: number) =>
  (text[i] === '’' || text[i] === "'") && /[A-Za-z]/.test(text[i - 1] ?? '') && /[A-Za-z]/.test(text[i + 1] ?? '')

// 句読点・閉じ括弧など、行頭に来てはいけない文字
const NO_START = new Set([...CLOSE, ...SENT_END, ...COMMA, ...'・：:；;ー～〜ゃゅょっぁぃぅぇぉャュョッァィゥェォ々ヽヾゝゞ…‥―'])

/** 段落を文に分ける。返り値は [開始, 終了) の組 */
export function splitSentences(text: string): [number, number][] {
  const out: [number, number][] = []
  let start = 0
  let depth = 0
  let i = 0
  while (i < text.length) {
    const c = text[i]
    if (OPEN.includes(c)) depth++
    else if (CLOSE.includes(c) && !isApostrophe(text, i)) depth = Math.max(0, depth - 1)
    // 閉じ括弧は、直後に次の会話が始まるときだけ文の区切りにする（「…」と言った、は 1 文）
    const closesBeforeOpen = depth === 0 && CLOSE.includes(c) && OPEN.includes(text[i + 1] ?? '')
    if (SENT_END.includes(c) || closesBeforeOpen || (c === '.' && isLatinSentenceEnd(text, i))) {
      // 続く記号（！？、閉じ括弧）も同じ文に含める
      let j = i + 1
      while (j < text.length && (SENT_END.includes(text[j]) || CLOSE.includes(text[j]))) {
        if (CLOSE.includes(text[j])) depth = Math.max(0, depth - 1)
        j++
      }
      // 括弧の中の句点（「…。と言った」）では文を切らない
      if (depth === 0) {
        out.push([start, j])
        start = j
      }
      i = j
      continue
    }
    i++
  }
  if (start < text.length) out.push([start, text.length])
  return out.filter(([a, b]) => text.slice(a, b).trim().length > 0)
}

type Kind = 'kanji' | 'hira' | 'kata' | 'alnum' | 'punct' | 'other'
function kindOf(c: string): Kind {
  if (/[一-鿿㐀-䶿々〆ヶ]/.test(c)) return 'kanji'
  if (/[ぁ-ゟ]/.test(c)) return 'hira'
  if (/[゠-ヿー]/.test(c)) return 'kata'
  if (/[0-9０-９A-Za-zＡ-Ｚａ-ｚ.,．，%％]/.test(c)) return 'alnum'
  if (/[、。，．！？!?「」『』（）()…‥―・：；]/.test(c)) return 'punct'
  return 'other'
}

const isGlue = (c: string) => c === '…' || c === '‥' || c === '―' || c === '—'

/** 文字列中で切ってよい位置か（i の直前で切る） */
function canBreakAt(s: string, i: number): boolean {
  if (i <= 0 || i >= s.length) return false
  const a = s[i - 1]
  const b = s[i]
  if (NO_START.has(b)) return false
  if (OPEN.includes(a)) return false
  if (kindOf(a) === 'alnum' && kindOf(b) === 'alnum') return false
  if (isGlue(a) && isGlue(b)) return false
  // 小書き文字や長音の直前では切らない（NO_START で処理済み）
  return true
}

/** 長い単位を max 文字以内に切る。字種の境目を優先する */
export function splitLong(s: string, max: number): string[] {
  const out: string[] = []
  let rest = s
  // 少しだけ超える程度なら、切って短い切れ端を作るより 1 単位のまま表示する
  while (visible(rest) > max + Math.min(3, Math.floor(max / 4))) {
    let best = -1
    let bestScore = -Infinity
    for (let i = 1; i < rest.length; i++) {
      if (visible(rest.slice(0, i)) > max) break
      if (!canBreakAt(rest, i)) continue
      const a = kindOf(rest[i - 1])
      const b = kindOf(rest[i])
      // 後ろに寄せたいので長さを点数に足し、字種が変わる位置を優遇する。
      // ひらがなの途中（「しまし｜た」など）と、3 字未満の切れ端が残る位置は避ける
      let score = i
      if (a !== b) score += 4
      if (COMMA.includes(rest[i - 1])) score += 8
      if (a === 'hira' && b === 'kanji') score += 2
      if (a === 'hira' && b === 'hira') score -= 8
      if (visible(rest.slice(i)) < 3) score -= 12
      if (score > bestScore) {
        bestScore = score
        best = i
      }
    }
    if (best <= 0) {
      // max までに切れる場所がない（長い「……」「――」「ーーー」や数字列）。
      // 記号の連なりを途中で切らないよう、max を超えて最初に切ってよい位置まで伸ばす。無ければ全部を 1 単位にする
      best = rest.length
      for (let i = nthVisibleIndex(rest, max); i < rest.length; i++) {
        if (canBreakAt(rest, i)) {
          best = i
          break
        }
      }
    }
    out.push(rest.slice(0, best))
    rest = rest.slice(best)
  }
  if (rest) out.push(rest)
  return out
}

function nthVisibleIndex(s: string, n: number): number {
  let count = 0
  for (let i = 0; i < s.length; i++) {
    if (!/\s/.test(s[i])) count++
    if (count === n) return i + 1
  }
  return s.length
}

export function visible(s: string): number {
  let n = 0
  for (const c of s) if (!/\s/.test(c)) n++
  return n
}

/** 1 文字ずつ。ただし句読点・閉じ括弧・小書き文字は前に、開き括弧は後ろにつける */
function splitChars(s: string): string[] {
  const out: string[] = []
  let pendingOpen = ''
  for (const c of s) {
    if (/\s/.test(c)) continue
    if (OPEN.includes(c)) {
      pendingOpen += c
      continue
    }
    const prevIsAlnum = out.length > 0 && kindOf(out[out.length - 1].slice(-1)) === 'alnum'
    if (out.length > 0 && !pendingOpen && (NO_START.has(c) || (prevIsAlnum && kindOf(c) === 'alnum'))) {
      out[out.length - 1] += c
    } else {
      out.push(pendingOpen + c)
      pendingOpen = ''
    }
  }
  if (pendingOpen) {
    if (out.length) out[out.length - 1] += pendingOpen
    else out.push(pendingOpen)
  }
  return out
}

/** BudouX の結果を補正する。句読点だけ・閉じ括弧だけの断片を前に寄せる */
function phrasesOf(sentence: string): string[] {
  const raw = budoux().parse(sentence)
  const out: string[] = []
  let carry = '' // 前の文節の末尾にあった開き括弧（次の文節の頭へ移す）
  for (const piece of raw) {
    let p = carry + piece
    carry = ''
    // 文節の頭に来た閉じ括弧・句読点・「!!」などは、前の文節の末尾へ移す
    if (out.length) {
      let k = 0
      while (k < p.length && (NO_START.has(p[k]) || /\s/.test(p[k]))) k++
      if (k > 0) {
        out[out.length - 1] += p.slice(0, k)
        p = p.slice(k)
      }
    }
    // 文節の末尾に来た開き括弧は、次の文節の頭へ移す
    let e = p.length
    while (e > 0 && OPEN.includes(p[e - 1])) e--
    if (e < p.length && e > 0) {
      carry = p.slice(e)
      p = p.slice(0, e)
    }
    if (p) out.push(p)
  }
  if (carry) {
    if (out.length) out[out.length - 1] += carry
    else out.push(carry)
  }
  return out
}

/** 欧文が主の文か（空白以外の文字の半分以上がラテン文字） */
export function isLatinText(s: string): boolean {
  const letters = s.replace(/\s/g, '')
  if (!letters) return false
  const latin = letters.match(/[A-Za-z\u00C0-\u024F]/g)?.length ?? 0
  return latin * 2 >= letters.length
}

/** 欧文の文を単語に分ける。単語の後ろの空白は単語に含める（つなぎ直したときに空白が残るように） */
const wordsOf = (sentence: string) => sentence.match(/\S+\s*/g) ?? []

/** 欧文の文をモードに応じて分ける。単語の途中では切らない */
function segmentLatin(sentence: string, opts: SegmentOptions): string[] {
  const words = wordsOf(sentence)
  switch (opts.mode) {
    case 'char':
    case 'short':
      return words
    case 'bunsetsu':
      // 1 文字の語（a, I）は次の語とつなぐ
      return joinUpTo(words, 2, 16)
    case 'phrase': {
      // 目標文字数は日本語の 1 文字を欧文の 2 文字とみなす（7 字 → 14 字、2〜3 語）
      const target = Math.max(8, opts.phraseTarget * 2)
      return joinUpTo(words, target, Math.round(target * 1.6))
    }
    case 'sentence': {
      const max = 80
      if (visible(sentence) <= max) return [sentence]
      const clauses = sentence.split(/(?<=[,;:]\s)/)
      return clauses.flatMap((c) => (visible(c) <= max ? [c] : joinUpTo(wordsOf(c), 40, 60)))
    }
  }
}

function joinUpTo(parts: string[], target: number, max: number): string[] {
  const out: string[] = []
  let cur = ''
  for (const p of parts) {
    const curLen = visible(cur)
    const pLen = visible(p)
    const endsHard = /[、，,」』）)]$/.test(cur.trimEnd())
    const startsDialogue = OPEN.includes(p[0])
    if (cur && (curLen + pLen > max || curLen >= target || endsHard || startsDialogue)) {
      out.push(cur)
      cur = p
    } else {
      cur += p
    }
  }
  if (cur) out.push(cur)
  return out
}

/** 1 文をモードに応じて分ける */
export function segmentSentence(sentence: string, opts: SegmentOptions): string[] {
  if (isLatinText(sentence)) return segmentLatin(sentence, opts)
  switch (opts.mode) {
    case 'char':
      return splitChars(sentence)
    case 'short': {
      const parts = phrasesOf(sentence).flatMap((p) => splitLong(p, 4))
      return joinUpTo(parts, 2, 4)
    }
    case 'bunsetsu': {
      const parts = phrasesOf(sentence).flatMap((p) => splitLong(p, 12))
      // 1 文字だけの文節は次とつなぐ
      return joinUpTo(parts, 2, 12)
    }
    case 'phrase': {
      const target = Math.max(4, opts.phraseTarget)
      const max = Math.round(target * 1.6)
      const parts = phrasesOf(sentence).flatMap((p) => splitLong(p, max))
      return joinUpTo(parts, target, max)
    }
    case 'sentence': {
      const max = 28
      if (visible(sentence) <= max) return [sentence]
      // 読点で節に分け、それでも長ければ文節でつなぎ直す
      const clauses = sentence.split(/(?<=[、，,])/)
      return clauses.flatMap((c) =>
        visible(c) <= max ? [c] : joinUpTo(phrasesOf(c).flatMap((p) => splitLong(p, 16)), 16, 20),
      )
    }
  }
}

function pauseOf(text: string, isLastInPara: boolean, endsSentence = false): Pause {
  if (isLastInPara) return 'paragraph'
  const t = text.replace(/[」』）)\]】〉》"”’\s]+$/, '')
  if (/[。！？!?．]$/.test(t)) return 'sentence'
  // 欧文のピリオドは略語（Dr. など）にも付くので、文の最後の単位のときだけ文の間にする
  if (endsSentence && t.endsWith('.')) return 'sentence'
  if (/[」』]$/.test(text.trim())) return 'sentence'
  if (/[、，,…―]$/.test(t)) return 'comma'
  return 'none'
}

/** 本文中の語の出現位置 [開始, 終了)。長い語を優先し、重なる出現は数えない */
export function findTerms(text: string, terms: string[]): [number, number][] {
  const out: [number, number][] = []
  const sorted = [...new Set(terms.filter(Boolean))].sort((a, b) => b.length - a.length)
  for (const t of sorted) {
    let i = text.indexOf(t)
    while (i >= 0) {
      const e = i + t.length
      if (!out.some(([a, b]) => a < e && i < b)) out.push([i, e])
      i = text.indexOf(t, e)
    }
  }
  return out.sort((a, b) => a[0] - b[0])
}

interface Piece {
  text: string
  start: number
  end: number
}

/** 隣り合う単位をつなぐ。文字列は元の段落から取り直す（英語の単語の間の空白を残すため） */
const joinPieces = (source: string, a: Piece, b: Piece): Piece => ({ text: source.slice(a.start, b.end).trim(), start: a.start, end: b.end })

/** 1 冊分をチャンクに分ける */
export function segmentBook(book: BookText, opts: SegmentOptions): Chunk[] {
  const chunks: Chunk[] = []
  const sentenceEnds = new Set<number>()
  const minChars = Math.max(1, opts.minChars ?? 1)
  book.paragraphs.forEach((para, pi) => {
    if (para.illust) {
      chunks.push({ text: '', para: pi, start: 0, end: 0, pause: 'none', len: 0, illust: para.illust })
      return
    }
    const nameRanges = opts.names?.length ? findTerms(para.text, opts.names) : []
    // ルビの親文字と人物名は途中で切らない
    const protect: [number, number][] = [...para.ruby.map((r) => [r.start, r.end] as [number, number]), ...nameRanges]
    const cutsInside = (pos: number) => protect.some(([a, b]) => a < pos && pos < b)

    const sentences = splitSentences(para.text)
    for (const [a, b] of sentences) {
      const latin = isLatinText(para.text.slice(a, b))
      const pieces = segmentSentence(para.text.slice(a, b), opts)
      // 元の文字位置を求めるため、元の文の中で順に探す（空白は分割時に落ちている場合がある）
      let local: Piece[] = []
      let cursor = a
      for (const piece of pieces) {
        const text = piece.trim()
        if (!text) continue
        const found = para.text.indexOf(text[0], cursor)
        const start = found >= 0 && found < b ? found : cursor
        const end = Math.min(b, Math.max(start + piece.length, start + 1))
        local.push({ text, start, end })
        cursor = end
      }
      // 保護範囲の途中で切れていれば、次の単位とつなぐ
      for (let i = 0; i < local.length - 1; ) {
        if (cutsInside(local[i].end)) local.splice(i, 2, joinPieces(para.text, local[i], local[i + 1]))
        else i++
      }
      // 最小字数に満たない単位は、同じ文の次の単位（文末なら前の単位）とつなぐ
      if (minChars > 1) {
        const merged: Piece[] = []
        for (const p of local) {
          const prev = merged[merged.length - 1]
          if (prev && visible(prev.text) < minChars) merged[merged.length - 1] = joinPieces(para.text, prev, p)
          else merged.push(p)
        }
        const last = merged[merged.length - 1]
        if (merged.length >= 2 && visible(last.text) < minChars) {
          merged.splice(merged.length - 2, 2, joinPieces(para.text, merged[merged.length - 2], last))
        }
        local = merged
      }
      for (const p of local) {
        const name = nameRanges.some(([s, e]) => s < p.end && p.start < e)
        const words = latin ? (p.text.match(/\S+/g)?.length ?? 0) : undefined
        chunks.push({
          text: p.text, para: pi, start: p.start, end: p.end, pause: 'none', len: visible(p.text),
          ...(words !== undefined ? { words } : {}), ...(name ? { name } : {}),
        })
      }
      if (local.length) sentenceEnds.add(chunks.length - 1)
    }
    for (let i = chunks.length - 1; i >= 0 && chunks[i].para === pi; i--) {
      chunks[i].pause = pauseOf(chunks[i].text, i === chunks.length - 1, sentenceEnds.has(i))
    }
  })
  return chunks
}

/** 欧文が主の本か（挿絵を除く単位の半分以上が欧文）。速度を WPM で表示するのに使う */
export function isLatinBook(chunks: Chunk[]): boolean {
  let latin = 0
  let all = 0
  for (const c of chunks) {
    if (c.illust) continue
    all++
    if (c.words !== undefined) latin++
  }
  return all > 0 && latin * 2 >= all
}

/** 本文位置に対応するチャンク番号（その位置を含むか、それより後で最初のもの） */
export function chunkIndexAt(chunks: Chunk[], pos: TextPosition): number {
  let lo = 0
  let hi = chunks.length - 1
  let ans = chunks.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const c = chunks[mid]
    if (c.para > pos.para || (c.para === pos.para && c.end > pos.offset)) {
      ans = mid
      hi = mid - 1
    } else lo = mid + 1
  }
  return Math.max(0, ans)
}

export function paragraphStartIndex(chunks: Chunk[], index: number): number {
  const p = chunks[index]?.para
  let i = index
  while (i > 0 && chunks[i - 1].para === p) i--
  return i
}
