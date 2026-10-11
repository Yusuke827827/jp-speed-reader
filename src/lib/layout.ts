// PDF.js のテキスト断片（座標つき）から、行と段落を復元する。
// 横書き・縦書きの両方を扱う。PDF の座標系は y が上向き。

import { normalizeChars, stripNotes } from './normalize'

export interface RawItem {
  str: string
  x: number // 左下 x
  y: number // 左下 y（ベースライン）
  w: number
  h: number
  size: number // フォントサイズ相当
  vertical: boolean
}

export interface Line {
  text: string
  /** 行の開始位置（横書きなら x、縦書きなら上端からの距離） */
  start: number
  /** 行の終端位置 */
  end: number
  /** 行の並び方向の位置（横書きなら y、縦書きなら x） */
  cross: number
  size: number
  /** text の各文字の位置 [開始, 終了)。ルビの親文字を探すのに使う */
  chars?: [number, number][]
}

export interface PageText {
  /** 段落を \n で区切った本文 */
  text: string
  /** 先頭の段落が前ページから続いているか */
  contFromPrev: boolean
  vertical: boolean
}

const PARA_OPENERS = /^[　「『（(【〈《〔［[―]/
const SENTENCE_END = /[。！？!?」』）)…―]$/

export function median(xs: number[]): number {
  if (xs.length === 0) return 0
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

export function detectVertical(items: RawItem[]): boolean {
  let v = 0
  let h = 0
  for (const it of items) {
    const n = it.str.trim().length
    if (n < 2) continue // 1 文字の断片は形から向きが分からない
    if (it.vertical || it.h > it.w * 1.5) v += n
    else h += n
  }
  if (v + h >= 20) return v > h
  // 1 文字ずつ配置された PDF: すぐ下に次の文字がある断片と、すぐ右にある断片の数を比べる
  return neighborVotes(items) > 0
}

function neighborVotes(items: RawItem[]): number {
  const singles = items.filter((i) => i.str.trim().length > 0)
  if (singles.length > 800) singles.length = 800 // 数が多いページは先頭だけで十分
  let vote = 0
  for (const a of singles) {
    const s = a.size || 10
    for (const b of singles) {
      if (a === b) continue
      const dx = b.x - a.x
      const dy = a.y - b.y // 下にあれば正
      if (Math.abs(dx) < s * 0.3 && dy > s * 0.5 && dy < s * 1.6) vote++
      else if (Math.abs(dy) < s * 0.3 && dx > s * 0.5 && dx < s * 1.6) vote--
    }
  }
  return vote
}

/** ルビや小さな柱など、本文より明らかに小さい文字を分ける */
export function splitSmallItems(items: RawItem[]): { body: RawItem[]; small: RawItem[]; bodySize: number } {
  const sizes: number[] = []
  for (const it of items) for (let i = 0; i < it.str.length; i++) sizes.push(it.size)
  const bodySize = median(sizes)
  if (bodySize === 0) return { body: items, small: [], bodySize }
  const body: RawItem[] = []
  const small: RawItem[] = []
  for (const it of items) (it.size >= bodySize * 0.62 ? body : small).push(it)
  return { body, small, bodySize }
}

/** 断片を行にまとめる */
export function groupLines(items: RawItem[], vertical: boolean): Line[] {
  const body = median(items.map((i) => i.size)) || 10
  // 縦書き: 列は x、列内は y の降順（上から下）。横書き: 行は y、行内は x の昇順。
  const crossOf = (it: RawItem) => (vertical ? it.x + it.w / 2 : it.y)
  const posOf = (it: RawItem) => (vertical ? -(it.y + it.h) : it.x)
  const endOf = (it: RawItem) => (vertical ? -it.y : it.x + it.w)

  const sorted = [...items].sort((a, b) =>
    vertical ? crossOf(b) - crossOf(a) : crossOf(b) - crossOf(a),
  )
  // 縦書きの句読点は升目の右上に寄せて組まれるため、列の中心から半文字ほどずれる。
  // 列（行）の平均位置と比べ、許容幅を 0.6 文字分とる（行間は通常 1.5 文字分以上ある）
  const groups: { items: RawItem[]; sum: number }[] = []
  const tol = body * 0.6
  for (const it of sorted) {
    const c = crossOf(it)
    const g = groups.find((g) => Math.abs(g.sum / g.items.length - c) <= tol)
    if (g) {
      g.items.push(it)
      g.sum += c
    } else groups.push({ items: [it], sum: c })
  }
  // 横書きは上から、縦書きは右から並べる（どちらも cross の降順）
  groups.sort((a, b) => b.sum / b.items.length - a.sum / a.items.length)

  return groups
    .map(({ items: g }) => {
      g.sort((a, b) => posOf(a) - posOf(b))
      let text = ''
      let prevEnd = -Infinity
      const chars: [number, number][] = []
      for (const it of g) {
        const gap = posOf(it) - prevEnd
        // 横書きの欧文で単語間が空いているときだけ空白を補う
        if (!vertical && text && gap > body * 0.25 && /[A-Za-z]{2,}[,.;:]?$/.test(text) && /^[A-Za-z]/.test(it.str)) {
          text += ' '
          chars.push([prevEnd, posOf(it)])
        }
        // 複数文字の断片は、文字ごとの位置を等分で見積もる
        const n = it.str.length
        const a = posOf(it)
        const step = (endOf(it) - a) / Math.max(1, n)
        for (let k = 0; k < n; k++) chars.push([a + step * k, a + step * (k + 1)])
        text += it.str
        prevEnd = Math.max(prevEnd, endOf(it))
      }
      return {
        text,
        start: Math.min(...g.map(posOf)),
        end: Math.max(...g.map(endOf)),
        cross: g.reduce((a, i) => a + crossOf(i), 0) / g.length,
        size: median(g.map((i) => i.size)),
        chars,
      }
    })
    .filter((l) => l.text.trim().length > 0)
}

/**
 * 小さい文字の並びをルビとみなし、隣の行の親文字に結び付けて、行の本文をルビ記法
 * （｜親文字《るび》）に書き換える。縦書きは列の右、横書きは行の上にあるものを探す。
 * 結び付け先が見つからない小さい文字（柱など）は捨てる。
 */
export function attachRuby(lines: Line[], small: RawItem[], vertical: boolean, bodySize: number) {
  if (small.length === 0 || lines.length === 0) return
  const crossOf = (it: RawItem) => (vertical ? it.x + it.w / 2 : it.y)
  const posOf = (it: RawItem) => (vertical ? -(it.y + it.h) : it.x)
  const endOf = (it: RawItem) => (vertical ? -it.y : it.x + it.w)

  // 近接する小さい文字をひと続きにまとめる
  const sorted = [...small].sort((a, b) => crossOf(b) - crossOf(a) || posOf(a) - posOf(b))
  const runs: { cross: number; s: number; e: number; text: string; size: number }[] = []
  for (const it of sorted) {
    const last = runs[runs.length - 1]
    const c = crossOf(it)
    if (last && Math.abs(last.cross - c) < it.size * 0.6 && posOf(it) - last.e < it.size * 1.6) {
      last.text += it.str
      last.e = Math.max(last.e, endOf(it))
    } else runs.push({ cross: c, s: posOf(it), e: endOf(it), text: it.str, size: it.size })
  }

  const marks = new Map<Line, { start: number; end: number; text: string }[]>()
  for (const r of runs) {
    const text = r.text.replace(/\s/g, '')
    // ルビはかな・カタカナがほとんど。それ以外（ページ番号の数字など）は対象外
    if (!text || !/^[\u3041-\u30FFー・]+$/.test(text)) continue
    let best: Line | null = null
    let bestD = Infinity
    for (const l of lines) {
      const d = r.cross - l.cross // 縦書きなら右、横書きなら上が正
      if (d > 0 && d < bodySize * 1.4 && d < bestD && r.e > l.start && r.s < l.end) {
        best = l
        bestD = d
      }
    }
    if (!best?.chars) continue
    const pad = bodySize * 0.3
    let start = -1
    let end = -1
    best.chars.forEach(([a, b], i) => {
      const mid = (a + b) / 2
      if (mid >= r.s - pad && mid <= r.e + pad) {
        if (start < 0) start = i
        end = i + 1
      }
    })
    if (start < 0) continue
    // 親文字の前後のかな（送り仮名など）は外す
    const isKanji = (c: string) => /[\u4E00-\u9FFF\u3400-\u4DBF々〆ヶ〇]/.test(c)
    const base = best.text.slice(start, end)
    if ([...base].some(isKanji)) {
      while (start < end && !isKanji(best.text[start])) start++
      while (end > start && !isKanji(best.text[end - 1])) end--
    }
    const list = marks.get(best) ?? []
    if (!list.some((m) => m.start < end && start < m.end)) list.push({ start, end, text })
    marks.set(best, list)
  }

  for (const [l, list] of marks) {
    list.sort((a, b) => b.start - a.start) // 後ろから書き換えて位置をずらさない
    let t = l.text
    for (const m of list) t = `${t.slice(0, m.start)}｜${t.slice(m.start, m.end)}《${m.text}》${t.slice(m.end)}`
    l.text = t
  }
}

const PAGE_NUMBER = /^[\s\-–—－‐・[(（]*([0-9０-９]+|[一二三四五六七八九十百〇]+|[ivxlcdmIVXLCDM]+)[\s\-–—－‐・\])）]*$/

export function isPageNumber(s: string): boolean {
  return PAGE_NUMBER.test(s.trim())
}

/** 行の列から段落を組み立て、ページ本文を作る（柱・ノンブルは除去済みの前提） */
export function buildPageText(lines: Line[], vertical: boolean): PageText {
  // 本文の行だけで行頭・行末の基準を測る（短い行は除く）
  const bodyLines = lines.filter((l) => l.text.trim().length >= 3)
  const lineStart = median(bodyLines.map((l) => l.start))
  const lineEnd = Math.max(0, ...bodyLines.map((l) => l.end))
  const size = median(bodyLines.map((l) => l.size)) || 10

  const paras: string[] = []
  let cur = ''
  let contFromPrev = true
  let prevShort = false

  for (const l of lines) {
    const t = cleanLine(l.text)
    if (!t) continue
    const indented = l.start - lineStart > size * 0.6
    const startsPara = PARA_OPENERS.test(l.text.replace(/^[ ｜]+/, '')) || indented
    const short = lineEnd - l.end > size * 1.5

    if (cur === '' && paras.length === 0) {
      contFromPrev = !startsPara
      cur = t
    } else if (startsPara || (prevShort && SENTENCE_END.test(cur))) {
      paras.push(cur)
      cur = t
    } else {
      cur = joinLine(cur, t)
    }
    prevShort = short
  }
  if (cur) paras.push(cur)
  if (paras.length === 0) contFromPrev = false
  return { text: paras.join('\n'), contFromPrev, vertical }
}

function cleanLine(s: string): string {
  return stripNotes(normalizeChars(s)).replace(/^[　 ]+/, '').replace(/[ \t]+$/, '')
}

/** 行をつなぐ。日本語同士なら空白を入れず、欧文同士なら 1 つ入れる */
export function joinLine(a: string, b: string): string {
  // 英単語どうしのときだけ空白を補う。数字（12.5 など）や日本語の間には入れない
  if (/[A-Za-z]{2,}[,.;:]?$/.test(a) && /^[A-Za-z]/.test(b)) {
    if (a.endsWith('-')) return a.slice(0, -1) + b
    return a + ' ' + b
  }
  return a + b
}

export interface PageLines {
  lines: Line[]
  vertical: boolean
}

/** ページの断片 → 行 */
export function itemsToLines(items: RawItem[]): PageLines {
  const usable = items.filter((i) => i.str.trim().length > 0)
  if (usable.length === 0) return { lines: [], vertical: false }
  const vertical = detectVertical(usable)
  const { body, small, bodySize } = splitSmallItems(usable)
  const lines = groupLines(body, vertical)
  attachRuby(lines, small, vertical, bodySize)
  return { lines, vertical }
}

const headerKey = (s: string) => s.replace(/[0-9０-９\s]/g, '')

/**
 * 複数ページに共通する柱（ランニングヘッダー）とノンブルを除いてから、各ページの本文を作る。
 * ページ端 2 行のうち、数字を除いた文字列が多くのページに現れるものを柱とみなす。
 */
export function linesToPageTexts(pages: PageLines[]): PageText[] {
  const edge = (p: PageLines) => {
    const n = p.lines.length
    return [...new Set([0, 1, n - 2, n - 1].filter((i) => i >= 0 && i < n))]
  }
  const counts = new Map<string, number>()
  for (const p of pages) {
    const keys = new Set(edge(p).map((i) => headerKey(p.lines[i].text)))
    for (const k of keys) if (k.length > 0) counts.set(k, (counts.get(k) ?? 0) + 1)
  }
  const threshold = Math.max(3, Math.ceil(pages.length * 0.3))
  const headers = new Set([...counts].filter(([, c]) => c >= threshold).map(([k]) => k))

  return pages.map((p) => {
    // 本文より明らかに小さい文字の端の行も柱とみなす（ページ数が少なく頻度で判定できない場合）
    const body = median(p.lines.map((l) => l.size))
    const drop = new Set(
      edge(p).filter((i) => {
        const l = p.lines[i]
        const t = l.text.trim()
        if (isPageNumber(t)) return true
        if (t.length > 40) return false
        return headers.has(headerKey(t)) || (body > 0 && l.size < body * 0.85)
      }),
    )
    return buildPageText(p.lines.filter((_, i) => !drop.has(i)), p.vertical)
  })
}
