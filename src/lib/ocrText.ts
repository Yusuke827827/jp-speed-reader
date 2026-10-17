// OCR の結果の文字列を本文に整える（ブラウザの API を使わない部分）

import { joinLine } from './layout'
import { isLatinText } from './segment'

/** Tesseract の出力を本文に整える。日本語の文字間の空白を消し、空行で段落を分ける */
export function cleanOcrText(raw: string): { text: string; contFromPrev: boolean } {
  const CJK = '[\\u3000-\\u30FF\\u3400-\\u9FFF\\uFF00-\\uFFEF々〆〇ー]'
  const noSpace = new RegExp(`(${CJK})[ \\t]+(?=${CJK})`, 'g')
  const paras: string[] = []
  let cur = ''
  for (const line of raw.split(/\r?\n/)) {
    const t = line.replace(noSpace, '$1').replace(noSpace, '$1').trim()
    if (!t) {
      if (cur) paras.push(cur)
      cur = ''
      continue
    }
    if (cur && /^[「『（　]/.test(t)) {
      paras.push(cur)
      cur = t
    } else cur = cur ? joinLine(cur, t) : t // 欧文は行の間に空白を入れ、行末のハイフンをつなぐ
  }
  if (cur) paras.push(cur)
  const first = raw.trimStart()
  return { text: paras.join('\n'), contFromPrev: !/^[「『（　]/.test(first) }
}

/** 日本語の学習データで読んだ結果が欧文主体なら、英語の学習データでも読み直す */
export function shouldTryEnglish(text: string): boolean {
  return isLatinText(text)
}
