// PDF から取り出した日本語テキストの正規化。
// NFKC を全体にかけると「…」が「...」に、全角英数が半角に変わってしまうため、
// 文字化けの原因になりやすい範囲だけを選んで NFKC を適用する。

// 康熙部首・CJK部首補助（⽇ → 日 のように PDF でよく混入する）
// CJK互換漢字、半角カナ
const COMPAT_RANGES = /[\u2E80-\u2FDF\uF900-\uFAFF\uFF61-\uFF9F]/g

export function normalizeChars(s: string): string {
  return s
    .replace(COMPAT_RANGES, (c) => c.normalize('NFKC'))
    .replace(/ /g, ' ')
    .replace(/[​-‍﻿­]/g, '') // ゼロ幅文字・ソフトハイフン
}

// 青空文庫形式の注記・ルビを本文から外す。
//   ｜漢字《かんじ》 → 漢字、漢字《かんじ》 → 漢字、［＃…］ → 削除
export function stripAozoraNotation(s: string): string {
  return s
    .replace(/［＃[^］]*］/g, '')
    .replace(/《[^》]*》/g, '')
    .replace(/｜/g, '')
}

/** 青空文庫の注記［＃…］だけを外す。ルビの記法（｜漢字《かんじ》）は残す */
export function stripNotes(s: string): string {
  return s.replace(/［＃[^］]*］/g, '')
}

export interface Ruby {
  /** 本文（ルビ記法を除いた文字列）上の範囲 [start, end) */
  start: number
  end: number
  text: string
}

const KANJI_RUN = /[\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF々〆ヶ〇]+$/

/**
 * ルビ記法を解析し、本文とルビの位置に分ける。
 *   ｜春風《はるかぜ》 … ｜ から 《 までが親文字
 *   春風《はるかぜ》   … 《 の直前に続く漢字が親文字
 */
export function parseRuby(s: string): { text: string; ruby: Ruby[] } {
  const ruby: Ruby[] = []
  let text = ''
  let bar = -1 // ｜ の位置（text 上）
  let i = 0
  while (i < s.length) {
    const c = s[i]
    if (c === '｜') {
      bar = text.length
      i++
      continue
    }
    if (c === '《') {
      const close = s.indexOf('》', i + 1)
      if (close < 0) {
        text += s.slice(i)
        break
      }
      const rt = s.slice(i + 1, close)
      let start = bar
      if (start < 0) {
        const m = text.match(KANJI_RUN)
        start = m ? text.length - m[0].length : -1
      }
      if (start >= 0 && start < text.length && rt) ruby.push({ start, end: text.length, text: rt })
      bar = -1
      i = close + 1
      continue
    }
    text += c
    i++
  }
  return { text, ruby }
}

// 括弧書きのルビ「漢字（かんじ）」は本文の一部である可能性もあるので消さない。

// 文字化けの度合い（0〜1）。私用領域・置換文字・制御文字の割合で見る。
export function garbledRatio(s: string): number {
  const body = s.replace(/\s/g, '')
  if (body.length === 0) return 0
  const bad = body.match(/[\uE000-\uF8FF\uFFFD\u0000-\u001F]/g)?.length ?? 0
  return bad / body.length
}

export function visibleLength(s: string): number {
  return s.replace(/\s/g, '').length
}
