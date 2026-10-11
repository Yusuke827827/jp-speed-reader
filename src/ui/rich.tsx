// 段落の一部を、ルビ（<ruby>）と人物名の色付きで描く。高速読書の中央表示と全文パネルで共通に使う。

import type { Ref, ReactNode } from 'react'
import type { Paragraph } from '../lib/book'
import type { PersonRange } from '../lib/people'

export interface RichOptions {
  ruby: boolean
  colors: boolean
  /** 強調する 1 文字の位置（段落内）。注視点ガイド用 */
  focusAt?: number
  focusRef?: Ref<HTMLSpanElement>
}

interface Atom {
  start: number
  end: number
  rt?: string
}

/** [start, end) を、ルビ付きのまとまりと 1 文字ずつに分ける */
function atomsOf(para: Paragraph, start: number, end: number, useRuby: boolean): Atom[] {
  const out: Atom[] = []
  let i = start
  while (i < end) {
    const r = useRuby ? para.ruby.find((x) => x.start === i && x.end <= end) : undefined
    if (r) {
      out.push({ start: r.start, end: r.end, rt: r.text })
      i = r.end
    } else {
      out.push({ start: i, end: i + 1 })
      i++
    }
  }
  return out
}

export function RichText({
  para,
  start,
  end,
  names,
  opts,
}: {
  para: Paragraph
  start: number
  end: number
  names: PersonRange[]
  opts: RichOptions
}) {
  const atoms = atomsOf(para, start, end, opts.ruby)
  const colorOf = (a: Atom) => (opts.colors ? names.find((n) => n.start <= a.start && a.start < n.end)?.person.color : undefined)

  // 同じ色が続く部分を 1 つの span にまとめる
  const groups: { color?: string; atoms: Atom[] }[] = []
  for (const a of atoms) {
    const c = colorOf(a)
    const last = groups[groups.length - 1]
    if (last && last.color === c) last.atoms.push(a)
    else groups.push({ color: c, atoms: [a] })
  }

  const renderAtom = (a: Atom): ReactNode => {
    const base = para.text.slice(a.start, a.end)
    const isFocus = opts.focusAt !== undefined && a.start <= opts.focusAt && opts.focusAt < a.end
    const node = a.rt ? (
      <ruby>
        {base}
        <rt>{a.rt}</rt>
      </ruby>
    ) : (
      base
    )
    return isFocus ? (
      <span key={a.start} ref={opts.focusRef} className="focus">
        {node}
      </span>
    ) : (
      <span key={a.start}>{node}</span>
    )
  }

  return (
    <>
      {groups.map((g) =>
        g.color ? (
          <span key={g.atoms[0].start} className="person" style={{ color: g.color }}>
            {g.atoms.map(renderAtom)}
          </span>
        ) : (
          g.atoms.map(renderAtom)
        ),
      )}
    </>
  )
}
