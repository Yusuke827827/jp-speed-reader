// テキストファイル（青空文庫形式を含む）の取り込み。
//
// - 文字コードは UTF-8（BOM の有無を問わない）を試し、読めなければ Shift_JIS とみなす。
//   青空文庫の配布ファイルは Shift_JIS。
// - 青空文庫形式なら、1 行目を題名、2 行目を著者とし、記号の説明（-------- で挟まれた部分）と
//   末尾の「底本：」以降を除く。ルビ記法（｜漢字《かんじ》）はそのまま残す。
// - ［＃「…」は大見出し］などの注記から目次を作り、ほかの注記は消す。
// - PDF のようなページは無いので、段落の切れ目で約 1200 字ごとに区切った「仮のページ」として保存する。

import type { TocEntry } from './db'
import { normalizeChars } from './normalize'

export const TEXT_PAGE_CHARS = 1200

export function decodeText(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf)
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^﻿/, '')
  } catch {
    return new TextDecoder('shift_jis').decode(bytes)
  }
}

export interface ParsedText {
  title?: string
  author?: string
  /** 仮のページごとの本文（段落は \n 区切り、ルビ記法を含む） */
  pages: string[]
  toc: TocEntry[]
}

const DASHES = /^-{10,}\s*$/
const HEADING = /［＃「([^」]+)」は(大|中|小)見出し］/
const HEADING_BLOCK = /［＃(大|中|小)見出し］(.*?)［＃\1見出し終わり］/
const DEPTH: Record<string, number> = { 大: 0, 中: 1, 小: 2 }

export function parseTextBook(raw: string): ParsedText {
  let lines = raw.replace(/\r\n?/g, '\n').split('\n')
  let title: string | undefined
  let author: string | undefined

  // 青空文庫形式: 題名・著者・記号の説明
  const firstDash = lines.findIndex((l) => DASHES.test(l))
  if (firstDash >= 0 && firstDash <= 6 && lines.slice(firstDash, firstDash + 12).some((l) => l.includes('記号について'))) {
    const head = lines.slice(0, firstDash).map((l) => l.trim()).filter(Boolean)
    title = head[0]
    author = head[1]
    const secondDash = lines.findIndex((l, i) => i > firstDash && DASHES.test(l))
    lines = lines.slice(secondDash >= 0 ? secondDash + 1 : firstDash + 1)
  }
  const footer = lines.findIndex((l) => /^底本：/.test(l))
  if (footer >= 0) lines = lines.slice(0, footer)

  // 段落と見出しを取り出す
  const paras: { text: string; heading?: { title: string; depth: number } }[] = []
  for (const line of lines) {
    let t = normalizeChars(line)
    let heading: { title: string; depth: number } | undefined
    const h = t.match(HEADING)
    const hb = t.match(HEADING_BLOCK)
    if (h) heading = { title: h[1], depth: DEPTH[h[2]] }
    else if (hb) heading = { title: hb[2].replace(/［＃[^］]*］/g, '').replace(/《[^》]*》|｜/g, '').trim(), depth: DEPTH[hb[1]] }
    t = t.replace(/［＃[^］]*］/g, '').replace(/^[　 ]+/, '').trimEnd()
    if (!t) continue
    paras.push({ text: t, heading })
  }

  // 空行で段落を区切る形式（1 段落が複数行にまたがる）なら、行をつなぐ
  // 判定: 句読点で終わらない行が多く、空行が多い
  const nonEmpty = lines.filter((l) => l.trim()).length
  const blank = lines.length - nonEmpty
  const openEnded = paras.filter((p) => !/[。」』！？!?]$/.test(p.text)).length
  if (blank > nonEmpty * 0.3 && openEnded > paras.length * 0.5) {
    const joined: typeof paras = []
    let cur: (typeof paras)[number] | null = null
    for (const line of lines) {
      const t = normalizeChars(line).replace(/［＃[^］]*］/g, '').trim()
      if (!t) {
        if (cur) joined.push(cur)
        cur = null
      } else if (cur) cur.text += t
      else cur = { text: t }
    }
    if (cur) joined.push(cur)
    paras.splice(0, paras.length, ...joined)
  }

  // 仮のページに分ける
  const pages: string[] = []
  const toc: TocEntry[] = []
  let cur: string[] = []
  let size = 0
  for (const p of paras) {
    if (size >= TEXT_PAGE_CHARS || (p.heading && cur.length > 0 && p.heading.depth === 0)) {
      pages.push(cur.join('\n'))
      cur = []
      size = 0
    }
    if (p.heading) toc.push({ title: p.heading.title, page: pages.length, depth: p.heading.depth })
    cur.push(p.text)
    size += p.text.length
  }
  if (cur.length) pages.push(cur.join('\n'))
  return { title, author, pages, toc }
}
