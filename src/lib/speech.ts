// 読み上げ（Web Speech API）と高速読書の表示を合わせるための計算。
// 1 文ずつ読ませ、読んでいる位置（文字の位置）の通知に合わせて中央の単位を進める。
// 通知が届かない端末では、文の長さと読み上げの速さから見積もって進める。

import type { Paragraph } from './book'
import type { Chunk } from './segment'

/**
 * i から始まる 1 文ぶんの単位の範囲 [i, j)。挿絵の手前、文末・段落末の単位で終わる。
 * 長い文は maxLen 字ほどで切る（Chrome は長い読み上げを途中で止めることがある）
 */
export function sentenceRange(chunks: Chunk[], i: number, maxLen = Infinity): [number, number] {
  let j = i
  let len = 0
  while (j < chunks.length) {
    const c = chunks[j]
    if (c.illust || c.para !== chunks[i].para) break
    if (j > i && len >= maxLen) break
    len += c.len
    j++
    if (c.pause === 'sentence' || c.pause === 'paragraph') break
  }
  return [i, Math.max(j, i + 1)]
}

/** 段落内の文字の位置 offset を含む単位（範囲 [from, to) の中で、offset 以前に始まる最後の単位） */
export function chunkAtOffset(chunks: Chunk[], from: number, to: number, offset: number): number {
  let k = from
  for (let i = from; i < to; i++) {
    if (chunks[i].start <= offset) k = i
    else break
  }
  return k
}

/** 読み上げの速さ 1 のときの、1 秒あたりのおおよその文字数（通知が無いときの見積もり用） */
export function charsPerSecond(latin: boolean, rate: number): number {
  return (latin ? 14 : 7.5) * rate
}

export function speechAvailable(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined'
}

/** 言語に合う声の一覧 */
export function voicesFor(lang: 'ja' | 'en'): SpeechSynthesisVoice[] {
  if (!speechAvailable()) return []
  return window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith(lang))
}

/**
 * iPhone の Safari は、画面に触れた直後でないと読み上げを始めさせない。
 * 再生ボタンを押した処理の中で無音の読み上げを一度行い、以降の読み上げを使えるようにする。
 */
export function unlockSpeech() {
  if (!speechAvailable()) return
  const u = new SpeechSynthesisUtterance(' ')
  u.volume = 0
  window.speechSynthesis.speak(u)
}

/**
 * 段落の [from, to) を読み上げる文字列にする。ルビのある語は読み（ルビ）で読ませる（人物名の読み違いを防ぐ）。
 * map[k] は読み上げ文字列の k 文字目が段落のどの位置に当たるか。
 */
export function speechText(para: Paragraph, from: number, to: number): { text: string; map: number[] } {
  let text = ''
  const map: number[] = []
  let i = from
  const rubies = para.ruby.filter((r) => r.start >= from && r.end <= to).sort((a, b) => a.start - b.start)
  for (const r of rubies) {
    if (r.start < i) continue
    for (; i < r.start; i++) {
      text += para.text[i]
      map.push(i)
    }
    for (const ch of r.text) {
      text += ch
      map.push(r.start)
    }
    i = r.end
  }
  for (; i < to; i++) {
    text += para.text[i]
    map.push(i)
  }
  return { text, map }
}
