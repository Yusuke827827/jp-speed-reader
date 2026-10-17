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
  /** 段組みのページでの段の番号（0 から）。段組みでなければ無し */
  column?: number
}

export interface PageText {
  /** 段落を \n で区切った本文 */
  text: string
  /** 先頭の段落が前ページから続いているか */
  contFromPrev: boolean
  vertical: boolean
}

const PARA_OPENERS = /^[　「『（(【〈《〔［[―]/
const SENTENCE_END = /(?:[。！？!?」』）)…―]|[A-Za-z]\.)$/
// 論文の節の見出し。この行だけで 1 段落にする。
// 番号付き（2 Method、3.1 Data、A Details）は大文字小文字を区別し、短い行に限る。名前の決まった見出しは区別しない
const NUMBERED_HEADING = /^(?:[0-9]+(?:\.[0-9]+)*|[A-Z])\.?\s+[A-Z][A-Za-z ,:&'-]{0,60}$/
const NAMED_HEADING =
  /^(?:abstract|references|bibliography|acknowledge?ments?|appendix(?:\s+[A-Z0-9]+)?|appendices|参考文献|引用文献|付録)$/i
// 欧文の語の終わりと始まり（後ろに閉じ記号、前に開き記号が付いてもよい）
const LATIN_END = /[A-Za-z0-9][.,;:!?%)\]"'’”]*$/
const LATIN_START = /^[(["'‘“]*[A-Za-z0-9]/

/** 欧文の語どうしで、間に空白が要るか。数字どうし（行や断片をまたぐ 12.｜5、1,｜000）には入れない */
const latinSpaceBetween = (a: string, b: string) =>
  LATIN_END.test(a) && LATIN_START.test(b) && !(/[0-9][.,]?$/.test(a) && /^[0-9]/.test(b))

export function median(xs: number[]): number {
  if (xs.length === 0) return 0
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/**
 * 縦書きか横書きかを決める。断片の形（縦長・横長）で 3 倍以上の差があればそれに従う。
 * 決まらないときは、縦・横の両方で行をまとめてみて、行の中の文字の間隔が 1 文字分に近い方を選ぶ。
 * 正しい向きでは約 1 文字分の間隔で並ぶ。誤った向きでは行間の分だけ離れるか、
 * 横長の断片を縦に割るなどして極端に詰まる。
 */
export function detectVertical(items: RawItem[]): boolean {
  let v = 0
  let h = 0
  for (const it of items) {
    const n = it.str.trim().length
    if (n < 2) continue // 1 文字の断片は形から向きが分からない
    if (it.vertical || it.h > it.w * 1.5) v += n
    else h += n
  }
  if (v + h >= 20 && (v >= h * 3 || h >= v * 3)) return v > h
  const pv = linePitch(items, true)
  const ph = linePitch(items, false)
  if (pv !== null && ph !== null) {
    const off = (p: number) => Math.abs(Math.log(Math.max(p, 0.01)))
    if (Math.abs(off(pv) - off(ph)) > 0.1) return off(pv) < off(ph)
  }
  if (v + h >= 20) return v > h
  // 1 文字ずつ配置された PDF: すぐ下に次の文字がある断片と、すぐ右にある断片の数を比べる
  return neighborVotes(items) > 0
}

/** その向きで行をまとめたときの、行の中で隣り合う文字の間隔の中央値（文字の大きさに対する比） */
export function linePitch(items: RawItem[], vertical: boolean): number | null {
  const { body } = splitSmallItems(items)
  const lines = groupLines(body, vertical)
  const gaps: number[] = []
  for (const l of lines) {
    const cs = l.chars ?? []
    for (let i = 1; i < cs.length; i++) gaps.push((cs[i][0] - cs[i - 1][0]) / (l.size || 1))
  }
  return gaps.length >= 10 ? median(gaps) : null
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
        if (!vertical && text && gap > body * 0.15 && latinSpaceBetween(text, it.str)) {
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
  // 本文の行だけで行頭・行末の基準を測る（短い行は除く）。段組みなら段ごとに測る
  const bodyLines = lines.filter((l) => l.text.trim().length >= 3)
  const metrics = new Map<number | undefined, { start: number; end: number }>()
  for (const col of new Set(lines.map((l) => l.column))) {
    const ls = bodyLines.filter((l) => l.column === col)
    metrics.set(col, { start: median(ls.map((l) => l.start)), end: Math.max(0, ...ls.map((l) => l.end)) })
  }
  const size = median(bodyLines.map((l) => l.size)) || 10

  const paras: string[] = []
  let cur = ''
  let contFromPrev = true
  let prevShort = false
  let prevSize = 0
  let afterHeading = false

  for (const l of lines) {
    const t = cleanLine(l.text)
    if (!t) continue
    const { start: lineStart, end: lineEnd } = metrics.get(l.column)!
    const indented = l.start - lineStart > size * 0.6
    // 字の大きさが前の行と変わる所（題名・著者・見出し）でも段落を分ける
    const resized = prevSize > 0 && Math.abs(l.size - prevSize) > Math.max(l.size, prevSize) * 0.08
    const short = lineEnd - l.end > size * 1.5
    const heading = NAMED_HEADING.test(t) || (short && NUMBERED_HEADING.test(t))
    const startsPara = PARA_OPENERS.test(l.text.replace(/^[ ｜]+/, '')) || indented || resized || heading || afterHeading

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
    prevSize = l.size
    afterHeading = heading
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
  // 行末のハイフンで分かれた英単語（exam- / ple）は、ハイフンを外してつなぐ
  if (/[A-Za-z]-$/.test(a) && /^[a-z]/.test(b)) return a.slice(0, -1) + b
  // 欧文の語どうしのときだけ空白を補う。日本語の間には入れない
  if (latinSpaceBetween(a, b)) return a + ' ' + b
  return a + b
}

/**
 * 横書きのページが左右 2 段に組まれていれば、段の境目の x を返す。
 * 中央付近で、行をまたいで文字の無い縦の帯を探す。帯をまたぐ行（題名など）は全体の 15% まで許す。
 */
export function findColumnGutter(items: RawItem[]): number | null {
  if (items.length === 0) return null
  const size = median(items.map((i) => i.size)) || 10
  const minX = Math.min(...items.map((i) => i.x))
  const maxX = Math.max(...items.map((i) => i.x + i.w))
  const width = maxX - minX
  if (width < size * 20) return null
  const lineKey = (it: RawItem) => Math.round(it.y / (size * 0.6))
  const allLines = new Set(items.map(lineKey)).size
  if (allLines < 3) return null
  let best: { g: number; cross: number } | null = null
  for (let g = minX + width * 0.3; g <= minX + width * 0.7; g += size / 4) {
    const crossLines = new Set(items.filter((i) => i.x < g && i.x + i.w > g).map(lineKey)).size
    if (best === null || crossLines < best.cross) best = { g, cross: crossLines }
  }
  if (!best || best.cross > allLines * 0.15) return null
  const g = best.g
  // 帯の両側に、ある程度の行数がなければ段組みではない（右側だけ短い詩の行など）
  const left = items.filter((i) => i.x + i.w <= g)
  const right = items.filter((i) => i.x >= g)
  const leftLines = new Set(left.map(lineKey)).size
  const rightLines = new Set(right.map(lineKey)).size
  if (leftLines < 3 || rightLines < 3 || leftLines < allLines * 0.25 || rightLines < allLines * 0.25) return null
  // 帯の幅が 1 文字分以上あること
  const leftEdge = Math.max(...left.map((i) => i.x + i.w))
  const rightEdge = Math.min(...right.map((i) => i.x))
  if (rightEdge - leftEdge < size * 0.8) return null
  return (leftEdge + rightEdge) / 2
}

/** 横書きの段組みを考えて行にまとめる。段をまたぐ行は、段より上なら先頭に、下なら末尾に置く */
function groupLinesWithColumns(items: RawItem[]): Line[] {
  const g = findColumnGutter(items)
  if (g === null) return groupLines(items, false)
  const span = items.filter((i) => i.x < g && i.x + i.w > g)
  const left = items.filter((i) => i.x + i.w <= g)
  const right = items.filter((i) => i.x >= g)
  const top = Math.max(...[...left, ...right].map((i) => i.y + i.h))
  const tag = (ls: Line[], column: number) => ls.map((l) => ({ ...l, column }))
  return [
    ...groupLines(span.filter((i) => i.y >= top), false),
    ...tag(groupLines(left, false), 0),
    ...tag(groupLines(right, false), 1),
    ...groupLines(span.filter((i) => i.y < top), false),
  ]
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
  const lines = vertical ? groupLines(body, true) : groupLinesWithColumns(body)
  attachRuby(lines, small, vertical, bodySize)
  return { lines, vertical }
}

/** 本文の字の大きさ。文字数で重みを付けた最頻値（脚注や柱の多いページでも本文の大きさを返す） */
function bodySizeOf(lines: Line[]): number {
  const count = new Map<number, number>()
  for (const l of lines) {
    const k = Math.round(l.size * 10) / 10
    count.set(k, (count.get(k) ?? 0) + l.text.length)
  }
  let best = 0
  let bestN = -1
  for (const [k, n] of count) if (n > bestN || (n === bestN && k > best)) [best, bestN] = [k, n]
  return best
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
    const body = bodySizeOf(p.lines)
    const drop = new Set(
      edge(p).filter((i) => {
        const l = p.lines[i]
        const t = l.text.trim()
        if (isPageNumber(t)) return true
        if (t.length > 40) return false
        return headers.has(headerKey(t)) || (body > 0 && l.size < body * 0.85)
      }),
    )
    // 横書きのページ（段組みなら各段）の下部で、本文より小さい字の行が続く部分は脚注とみなして除く（ノンブルは上で除いた）
    if (!p.vertical && body > 0) {
      for (const col of new Set(p.lines.map((l) => l.column))) {
        const idx = p.lines.flatMap((l, i) => (l.column === col ? [i] : []))
        for (let k = idx.length - 1; k >= 0; k--) {
          const i = idx[k]
          if (drop.has(i)) continue
          if (p.lines[i].size >= body * 0.88) break
          drop.add(i)
        }
      }
    }
    return buildPageText(p.lines.filter((_, i) => !drop.has(i)), p.vertical)
  })
}
