// 人物の登録を助ける処理。人名かどうかを確実に判定する方法はないため、
// ここで返すのは「候補」で、登録は利用者が選ぶ。

import type { BookText } from './book'
import type { Person } from './db'
import { findTerms } from './segment'

export const PERSON_COLORS = ['#a8761b', '#b5422e', '#2f6f8f', '#5b7f2a', '#7a4f9a', '#a34d72']

export interface Candidate {
  word: string
  count: number
  reason: string
}

const HONORIFIC = /([\u4E00-\u9FFF々\u30A1-\u30FFー]{1,5})(さん|さま|様|君|くん|ちゃん|殿|先生|氏)/g
const KATAKANA = /[\u30A1-\u30FAー]{2,8}/g
// 人名でないことが多いカタカナ語（よく出るもの）
const COMMON_KATAKANA = new Set(['ドア', 'テーブル', 'ベッド', 'コーヒー', 'ページ', 'ノート', 'メール', 'テレビ', 'ホテル', 'バス', 'タクシー', 'ポケット', 'カーテン', 'ガラス'])

export function suggestPeople(book: BookText, registered: Person[], limit = 20): Candidate[] {
  const known = new Set(registered.flatMap((p) => [p.name, ...p.aliases]))
  // 語 → 候補に挙げた理由（最初に見つかったもの）
  const reasons = new Map<string, string>()
  const bump = (w: string, reason: string) => {
    if (!known.has(w) && !reasons.has(w)) reasons.set(w, reason)
  }
  for (const p of book.paragraphs) {
    for (const r of p.ruby) {
      const base = p.text.slice(r.start, r.end)
      if (base.length >= 1 && base.length <= 4) bump(base, 'ルビ付き')
    }
    for (const m of p.text.matchAll(HONORIFIC)) bump(m[1], `「${m[2]}」付き`)
    for (const m of p.text.matchAll(KATAKANA)) if (!COMMON_KATAKANA.has(m[0])) bump(m[0], 'カタカナ')
  }
  // 出現回数は本文全体で数え直す
  const all = book.paragraphs.map((p) => p.text).join('\n')
  const out: Candidate[] = []
  for (const [word, reason] of reasons) {
    const count = findTerms(all, [word]).length
    if (count >= (reason === 'カタカナ' ? 3 : 2)) out.push({ word, count, reason })
  }
  return out.sort((a, b) => b.count - a.count).slice(0, limit)
}

/** 章の境目（段落番号）。目次のページから求める。目次が無ければ本全体を 1 章とする */
export function chapterStarts(book: BookText, tocPages: number[]): number[] {
  const starts = new Set<number>([0])
  for (const page of tocPages) {
    const i = book.paragraphs.findIndex((p) => p.pageMarks.some(([, pg]) => pg >= page))
    if (i > 0) starts.add(i)
  }
  return [...starts].sort((a, b) => a - b)
}

export interface PersonRange {
  start: number
  end: number
  person: Person
}

/** 本文中の人物名（別名を含む）の位置。長い名前を優先し、重なる出現は数えない */
export function personRanges(text: string, people: Person[]): PersonRange[] {
  const terms = people.flatMap((person) => [person.name, ...person.aliases].filter(Boolean).map((t) => ({ t, person })))
  terms.sort((a, b) => b.t.length - a.t.length)
  const out: PersonRange[] = []
  for (const { t, person } of terms) {
    let i = text.indexOf(t)
    while (i >= 0) {
      const e = i + t.length
      if (!out.some((r) => r.start < e && i < r.end)) out.push({ start: i, end: e, person })
      i = text.indexOf(t, e)
    }
  }
  return out.sort((a, b) => a.start - b.start)
}

export function personTerms(people: Person[]): string[] {
  return people.flatMap((p) => [p.name, ...p.aliases]).filter(Boolean)
}
