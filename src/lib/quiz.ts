// 理解度の確認: 読んだ範囲の本文から、端末の中だけで問題を作る（外部の AI は使わない）。
// 穴埋め … 文の中の語を 1 つ隠し、4 つの候補から選ぶ。登録した人物名があれば優先して隠す
// 順番   … 読んだ範囲の 2 つの文のうち、どちらが先に出てきたかを答える

import type { BookText, TextPosition } from './book'
import { splitSentences } from './segment'

export interface SentenceRef {
  para: number
  start: number
  end: number
  text: string
}

export type Question =
  | { kind: 'cloze'; src: SentenceRef; before: string; after: string; answer: string; choices: string[] }
  | { kind: 'order'; a: SentenceRef; b: SentenceRef; first: 'a' | 'b' }

type Rng = () => number

const visibleLen = (s: string) => s.replace(/\s/g, '').length

/** pos より前の、読み終えた文をおよそ span 字ぶん（minLen 字より短い文は除く）。本文の順に並ぶ */
export function readSentences(book: BookText, pos: TextPosition, span = 2000, minLen = 8): SentenceRef[] {
  const out: SentenceRef[] = []
  let total = 0
  for (let p = pos.para; p >= 0 && total < span; p--) {
    const para = book.paragraphs[p]
    if (!para || para.illust || !para.text) continue
    const limit = p === pos.para ? pos.offset : para.text.length
    const sents = splitSentences(para.text).filter(([, e]) => e <= limit)
    for (let k = sents.length - 1; k >= 0 && total < span; k--) {
      const [s, e] = sents[k]
      const text = para.text.slice(s, e).trim()
      total += visibleLen(text)
      if (visibleLen(text) >= minLen) out.unshift({ para: p, start: s, end: e, text })
    }
  }
  return out
}

type Kind = 'name' | 'kanji' | 'kata'
const WORD = /[\p{Script=Han}々〆ヶ]{2,}|[\p{Script=Katakana}ー]{3,}/gu

function kindOf(w: string, names: Set<string>): Kind {
  if (names.has(w)) return 'name'
  return /\p{Script=Han}/u.test(w) ? 'kanji' : 'kata'
}

/** 文の中の、隠せる語（文の中に 1 回だけ出る語）。人物名を先に、長い語を先に並べる */
function termsIn(text: string, names: string[]): { word: string; at: number }[] {
  const found: { word: string; at: number }[] = []
  for (const n of names) {
    const at = text.indexOf(n)
    if (at >= 0 && text.indexOf(n, at + 1) < 0) found.push({ word: n, at })
  }
  for (const m of text.matchAll(WORD)) {
    const w = m[0]
    if (found.some((f) => m.index! < f.at + f.word.length && f.at < m.index! + w.length)) continue
    if (text.indexOf(w, m.index! + 1) >= 0) continue
    found.push({ word: w, at: m.index! })
  }
  return found
}

function shuffle<T>(a: T[], rng: Rng): T[] {
  const b = [...a]
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[b[i], b[j]] = [b[j], b[i]]
  }
  return b
}

/** 正解と同じ種類で、長さの近い語を 3 つ選ぶ。読んだ範囲で足りなければ本全体から探す */
function distractors(answer: string, sentence: string, pool: string[], names: Set<string>, rng: Rng): string[] | null {
  const kind = kindOf(answer, names)
  const ok = (w: string) => w !== answer && !sentence.includes(w) && !answer.includes(w) && !w.includes(answer) && kindOf(w, names) === kind
  const cands = [...new Set(pool.filter(ok))]
  const near = cands.filter((w) => Math.abs(w.length - answer.length) <= 1)
  const picked = shuffle(near, rng).slice(0, 3)
  if (picked.length < 3) picked.push(...shuffle(cands.filter((w) => !picked.includes(w)), rng).slice(0, 3 - picked.length))
  // 登録した人物が 3 人に満たないときは、長さの近い漢字の語で補う
  if (kind === 'name' && picked.length < 3) {
    const more = [...new Set(pool)].filter((w) => w !== answer && !picked.includes(w) && !sentence.includes(w) && kindOf(w, names) === 'kanji' && Math.abs(w.length - answer.length) <= 1)
    picked.push(...shuffle(more, rng).slice(0, 3 - picked.length))
  }
  return picked.length === 3 ? picked : null
}

function wordsOf(texts: string[], names: string[]): string[] {
  const out: string[] = []
  for (const t of texts) {
    for (const n of names) if (t.includes(n)) out.push(n)
    for (const m of t.matchAll(WORD)) out.push(m[0])
  }
  return out
}

/**
 * pos までに読んだ範囲から count 問を作る。順番の問題は 1 問まで、残りは穴埋め。
 * 読んだ文が少なすぎるときは空の配列を返す
 */
export function buildQuiz(book: BookText, pos: TextPosition, names: string[], rng: Rng = Math.random, count = 3): Question[] {
  const sents = readSentences(book, pos)
  if (sents.length < 4) return []
  const nameSet = new Set(names)
  const near = wordsOf(
    sents.map((s) => s.text),
    names,
  )
  let whole: string[] | null = null
  const pool = () => (whole ??= near.concat(wordsOf(book.paragraphs.slice(0, 400).map((p) => p.text), names)))

  const out: Question[] = []
  // 順番: 離れた 2 文（全体の 3 分の 1 以上離す）
  const gap = Math.max(2, Math.floor(sents.length / 3))
  const i = Math.floor(rng() * (sents.length - gap))
  const j = i + gap + Math.floor(rng() * (sents.length - i - gap))
  const swap = rng() < 0.5
  const orderQ: Question = swap ? { kind: 'order', a: sents[j], b: sents[i], first: 'b' } : { kind: 'order', a: sents[i], b: sents[j], first: 'a' }

  // 穴埋め: 新しく読んだ文から順に候補を試す。人物名のある文を先に
  const order = shuffle(sents, rng).sort((x, y) => Number(names.some((n) => y.text.includes(n))) - Number(names.some((n) => x.text.includes(n))))
  for (const s of order) {
    if (out.length >= count - 1) break
    const terms = termsIn(s.text, names)
    for (const term of terms) {
      const d = distractors(term.word, s.text, near, nameSet, rng) ?? distractors(term.word, s.text, pool(), nameSet, rng)
      if (!d) continue
      out.push({
        kind: 'cloze',
        src: s,
        before: s.text.slice(0, term.at),
        after: s.text.slice(term.at + term.word.length),
        answer: term.word,
        choices: shuffle([term.word, ...d], rng),
      })
      break
    }
  }
  out.push(orderQ)
  return out.slice(0, count)
}
