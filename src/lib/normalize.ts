// PDF から取り出した日本語テキストの正規化。
// NFKC を全体にかけると「…」が「...」に、全角英数が半角に変わってしまうため、
// 文字化けの原因になりやすい範囲だけを選んで NFKC を適用する。

// 康熙部首・CJK部首補助（⽇ → 日 のように PDF でよく混入する）、縦書き用の句読点・括弧（︒ → 。）
// CJK互換漢字、半角カナ
const COMPAT_RANGES = /[\u2E80-\u2FDF\uF900-\uFAFF\uFF61-\uFF9F\uFE10-\uFE19\uFE30-\uFE4F]/g

// 縦書き用の句読点・括弧。NFKC では「？」「！」「（）」が半角になるので、全角の対応を自前で持つ
const VERTICAL: Record<string, string> = {
  '︐': '，', '︑': '、', '︒': '。', '︓': '：', '︔': '；', '︕': '！', '︖': '？', '︗': '〖', '︘': '〗', '︙': '…', '︰': '‥', '︱': '―', '︲': '–', '︵': '（', '︶': '）', '︷': '｛', '︸': '｝', '︹': '〔', '︺': '〕', '︻': '【', '︼': '】', '︽': '《', '︾': '》', '︿': '〈', '﹀': '〉', '﹁': '「', '﹂': '」', '﹃': '『', '﹄': '』', '﹇': '［', '﹈': '］',
}

// 康熙部首を NFKC で戻すと、日本で使わない字体になる字がある（⿊ → 黑 など）。日本の字体にそろえる
const KANGXI_JA: Record<string, string> = { '黑': '黒', '戶': '戸', '靑': '青', '龜': '亀', '麥': '麦', '黃': '黄', '齒': '歯' }
function toJapanese(nfkc: string, original: string): string {
  const code = original.charCodeAt(0)
  return code >= 0x2f00 && code <= 0x2fdf ? (KANGXI_JA[nfkc] ?? nfkc) : nfkc
}

// CJK部首補助のうち NFKC で戻らないが、PDF で漢字の代わりに使われやすいもの
const RADICALS: Record<string, string> = {
  '⺟': '母', '⺠': '民', '⻁': '虎', '⻄': '西', '⻆': '角',
  '⻏': '邑', '⻑': '長', '⻘': '青', '⻝': '食', '⻤': '鬼',
  '⻨': '麦', '⻩': '黄', '⻫': '斉', '⻭': '歯', '⻯': '竜', '⻲': '亀',
}

export function normalizeChars(s: string): string {
  return s
    .replace(COMPAT_RANGES, (c) => VERTICAL[c] ?? RADICALS[c] ?? toJapanese(c.normalize('NFKC'), c))
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

const KANA_ONLY = /^[\u3041-\u30FFー・ ]+$/
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
      // ｜の無い記法は、直前が漢字で、中身がかなだけのときに限る。
      // それ以外（《大賢者》のような本文中の括弧）は本文としてそのまま残す
      if (start < 0 && KANA_ONLY.test(rt)) {
        const m = text.match(KANJI_RUN)
        start = m ? text.length - m[0].length : -1
      }
      if (start >= 0 && start < text.length && rt) {
        ruby.push({ start, end: text.length, text: rt })
        i = close + 1
      } else {
        text += s.slice(i, close + 1)
        i = close + 1
      }
      bar = -1
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
