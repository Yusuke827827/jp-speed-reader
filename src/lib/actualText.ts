// 文字対応表（ToUnicode）が壊れている PDF の修復。
//
// 縦書きの PDF には、縦組み用の字形（縦の「ー」、小書きの「っ」など）の対応先を
// 0000（空）にして、代わりにページの描画命令の ActualText に本当の文字を書いているものがある。
// PDF.js は ActualText を読まないため、その文字が抜け落ちる。
// ここでは描画命令から「字形番号 → ActualText の文字」を集め、ToUnicode の 0000 を書き換えた PDF を作る。
// pdf-lib は大きいので、この修復が必要な PDF のときだけ読み込む。

import type { PDFRawStream as RawStream, PDFRef as Ref } from 'pdf-lib'

export interface FixResult {
  bytes: Uint8Array
  /** 書き換えた対応の数 */
  fixed: number
}

const decoder = new TextDecoder('latin1')

/** UTF-16BE の 16 進表記（FEFF 付き）を文字列にする */
function hexToText(hex: string): string {
  const h = hex.replace(/^FEFF/i, '')
  let s = ''
  for (let i = 0; i + 4 <= h.length; i += 4) s += String.fromCharCode(parseInt(h.slice(i, i + 4), 16))
  return s
}

/**
 * 描画命令の文字列から、フォントごとの「字形番号 → 文字」を集める。
 * ActualText の範囲の字形の数と、注記の文字数が同じときだけ、順に対応させる（数が違うと対応が決まらない）。
 */
export function collectActualText(content: string): Map<string, Map<number, string>> {
  const out = new Map<string, Map<number, string>>()
  const re = /\/([^\s/<>[\]()]+)\s+[-\d.]+\s+Tf|\/Span\s*<<\s*\/ActualText\s*<([0-9A-Fa-f]+)>\s*>>\s*BDC([\s\S]*?)EMC/g
  let font = ''
  for (let m = re.exec(content); m; m = re.exec(content)) {
    if (m[1]) {
      font = m[1]
      continue
    }
    const chars = [...hexToText(m[2])]
    // Tj ごとの字形（4 桁ずつ）を順に並べる。字形の数と文字の数が同じときだけ、順に対応させる
    const glyphs = [...m[3].matchAll(/<([0-9A-Fa-f]+)>\s*Tj/g)].flatMap((g) => g[1].match(/.{4}/g) ?? [])
    if (!font || glyphs.length === 0 || glyphs.length !== chars.length) continue
    const map = out.get(font) ?? new Map<number, string>()
    glyphs.forEach((g, i) => map.set(parseInt(g, 16), chars[i]))
    out.set(font, map)
  }
  return out
}

/** ToUnicode の中の「<字形> <0000>」を、分かった文字に書き換える */
export function patchToUnicode(cmap: string, fixes: Map<number, string>): { text: string; fixed: number } {
  let fixed = 0
  const text = cmap.replace(/<([0-9A-Fa-f]{4})>(\s*)<0000>/g, (all, cid: string, sp: string) => {
    const ch = fixes.get(parseInt(cid, 16))
    if (!ch) return all
    fixed++
    const hex = [...ch].map((c) => c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')).join('')
    return `<${cid}>${sp}<${hex}>`
  })
  return { text, fixed }
}

export async function fixActualText(data: Uint8Array): Promise<FixResult> {
  const { PDFDocument, PDFName, PDFDict, PDFArray, PDFRawStream, PDFRef, decodePDFRawStream } = await import('pdf-lib')
  const pdf = await PDFDocument.load(data, { updateMetadata: false, ignoreEncryption: true })
  const ctx = pdf.context
  const decode = (s: unknown) => decoder.decode(decodePDFRawStream(s as RawStream).decode())

  // ToUnicode のストリーム（参照）ごとに、直すべき対応を集める
  const fixesByCmap = new Map<string, { ref: Ref; fixes: Map<number, string> }>()
  for (const page of pdf.getPages()) {
    const contents = page.node.Contents()
    const streams = contents instanceof PDFArray ? contents.asArray().map((r) => ctx.lookup(r)) : contents ? [contents] : []
    const text = streams.map((s) => (s instanceof PDFRawStream ? decode(s) : '')).join('\n')
    if (!text.includes('ActualText')) continue
    const fonts = page.node.Resources()?.lookup(PDFName.of('Font'), PDFDict)
    if (!fonts) continue
    for (const [fontName, map] of collectActualText(text)) {
      const font = fonts.lookup(PDFName.of(fontName), PDFDict)
      const ref = font?.get(PDFName.of('ToUnicode'))
      if (!(ref instanceof PDFRef)) continue
      const key = ref.toString()
      const entry = fixesByCmap.get(key) ?? { ref, fixes: new Map<number, string>() }
      for (const [cid, ch] of map) entry.fixes.set(cid, ch)
      fixesByCmap.set(key, entry)
    }
  }

  let fixed = 0
  for (const { ref, fixes } of fixesByCmap.values()) {
    const stream = ctx.lookup(ref)
    if (!(stream instanceof PDFRawStream)) continue
    const patched = patchToUnicode(decode(stream), fixes)
    if (patched.fixed === 0) continue
    fixed += patched.fixed
    ctx.assign(ref, ctx.flateStream(patched.text))
  }
  if (fixed === 0) return { bytes: data, fixed }
  return { bytes: await pdf.save({ useObjectStreams: false }), fixed }
}
