// 各チャンクの表示時間を決める。
//
// 速度の基準は「文字/分」（空白を除いた文字数）。
// 各チャンクに「重み（文字数 + 句読点の間 ＋ 最低表示量の補正）」を与え、
// 段落の切れ目でまとめた約 240 字ごとの区間で「区間の文字数 ÷ 区間の表示時間」が
// 設定速度と一致するように、区間ごとに 1 重みあたりの時間を決める。
// 本全体の平均だけを合わせると、句点や会話の多い区間で体感速度が設定より遅くなるため、
// 区間単位で合わせている。間を入れても、どの区間でも平均速度は変わらない。
//
// 1 チャンクの表示時間には下限（MIN_MS）がある。下限に当たるチャンクがあっても
// 区間の平均が合うよう、1 重みあたりの時間を二分探索で決める。
// 区間の全チャンクを下限で出しても間に合わない極端な設定だけは、設定より遅くなる（limited）。

import type { Chunk } from './segment'

export interface TimingOptions {
  /** 文字/分 */
  cpm: number
  /** 句読点で間をとるか */
  pauses: boolean
  /** 間の長さの倍率（1 = 標準） */
  pauseScale: number
  /** 人物名を含む単位を少し長く表示する */
  nameBoost?: boolean
}

export const MIN_MS = 40

/** 速度を合わせる区間の目安の文字数 */
export const BLOCK_CHARS = 240

/** 間の大きさ（文字数換算） */
const PAUSE_UNITS = { none: 0, comma: 1.5, sentence: 3, paragraph: 5 } as const

/** 人物名を含む単位に足す時間（文字数換算） */
const NAME_UNITS = 1.5

/** 短すぎるチャンクが一瞬で消えないよう、最低でもこの文字数ぶんは表示する */
const MIN_UNITS = 1.6

export function weightOf(c: Chunk, opts: TimingOptions): number {
  // 長いチャンクは目の移動が少ない分だけ、1 文字あたりの重みを少し下げる
  const len = c.len <= 8 ? c.len : 8 + (c.len - 8) * 0.85
  const base = Math.max(MIN_UNITS, len)
  const pause = opts.pauses ? PAUSE_UNITS[c.pause] * opts.pauseScale : 0
  const name = opts.nameBoost && c.name ? NAME_UNITS : 0
  return base + pause + name
}

export interface Schedule {
  weights: Float32Array
  /** チャンクごとの、重み 1 あたりのミリ秒（所属する区間の値） */
  unit: Float32Array
  totalChars: number
  /** 速度を合わせた区間 [開始, 終了) */
  blocks: [number, number][]
  /** 下限のせいで設定速度を出せない区間がある */
  limited: boolean
}

/** 区間 [from, to) の 1 重みあたりの時間を求める */
function solveBlock(weights: Float32Array, chars: number, from: number, to: number, msPerChar: number) {
  const target = chars * msPerChar
  let totalW = 0
  for (let i = from; i < to; i++) totalW += weights[i]
  if (totalW === 0) return { unit: msPerChar, limited: false }
  const total = (u: number) => {
    let t = 0
    for (let i = from; i < to; i++) t += Math.max(MIN_MS, weights[i] * u)
    return t
  }
  const limited = (to - from) * MIN_MS > target
  let lo = 0
  let hi = target / totalW // total(hi) >= target が成り立つ
  if (!limited) {
    for (let k = 0; k < 40; k++) {
      const mid = (lo + hi) / 2
      if (total(mid) > target) hi = mid
      else lo = mid
    }
  }
  return { unit: hi, limited }
}

export function buildSchedule(chunks: Chunk[], opts: TimingOptions): Schedule {
  const n = chunks.length
  const weights = new Float32Array(n)
  const unit = new Float32Array(n)
  let totalChars = 0
  for (let i = 0; i < n; i++) {
    weights[i] = weightOf(chunks[i], opts)
    totalChars += chunks[i].len
  }
  const msPerChar = 60000 / Math.max(1, opts.cpm)

  // 段落の切れ目で区間を区切る。最後の短い残りは直前の区間に含める
  const blocks: [number, number, number][] = []
  let start = 0
  let chars = 0
  for (let i = 0; i < n; i++) {
    chars += chunks[i].len
    const boundary = chunks[i].pause === 'paragraph' || i === n - 1
    if (boundary && (chars >= BLOCK_CHARS || i === n - 1)) {
      blocks.push([start, i + 1, chars])
      start = i + 1
      chars = 0
    }
  }
  if (blocks.length >= 2 && blocks[blocks.length - 1][2] < BLOCK_CHARS / 2) {
    const last = blocks.pop()!
    const prev = blocks.pop()!
    blocks.push([prev[0], last[1], prev[2] + last[2]])
  }

  let limited = false
  for (const [from, to, c] of blocks) {
    const r = solveBlock(weights, c, from, to, msPerChar)
    unit.fill(r.unit, from, to)
    limited ||= r.limited
  }
  return { weights, unit, totalChars, limited, blocks: blocks.map(([a, b]) => [a, b] as [number, number]) }
}

export function durationOf(s: Schedule, index: number): number {
  return Math.max(MIN_MS, s.weights[index] * s.unit[index])
}

/** 指定範囲を表示したときの実速度（文字/分）。テストと画面表示で使う */
export function effectiveCpm(chunks: Chunk[], s: Schedule, from = 0, to = chunks.length): number {
  let ms = 0
  let chars = 0
  for (let i = from; i < to; i++) {
    ms += durationOf(s, i)
    chars += chunks[i].len
  }
  return ms > 0 ? (chars / ms) * 60000 : 0
}

/** 残り時間（ミリ秒） */
export function remainingMs(chunks: Chunk[], s: Schedule, from: number): number {
  let ms = 0
  for (let i = from; i < chunks.length; i++) ms += durationOf(s, i)
  return ms
}

export const SPEED_PRESETS = [
  { label: 'ゆっくり', cpm: 400 },
  { label: '標準', cpm: 600 },
  { label: '速い', cpm: 900 },
  { label: '高速', cpm: 1300 },
]

export const CPM_MIN = 100
export const CPM_MAX = 3000
