// PDF.js の getTextContent() の結果を、レイアウト解析用の断片に変換する。
// ブラウザに依存しないので、Node 上のテストからも使える。

import type { RawItem } from './layout'
import { normalizeChars } from './normalize'

interface TCItem {
  str?: string
  transform?: number[]
  width?: number
  height?: number
  fontName?: string
}

export interface TextContentLike {
  items: unknown[]
  styles: Record<string, { vertical?: boolean } | undefined>
}

export function toRawItems(tc: TextContentLike): RawItem[] {
  const items: RawItem[] = []
  for (const raw of tc.items) {
    const it = raw as TCItem
    if (typeof it.str !== 'string' || it.str.length === 0 || !it.transform) continue
    const [a, b, c, d, e, f] = it.transform
    const vertical = !!tc.styles[it.fontName ?? '']?.vertical
    const size = Math.hypot(c, d) || Math.hypot(a, b) || it.height || 10
    // 縦書きの断片は (e, f) が上端なので、下端に揃える
    const h = vertical ? Math.abs(it.height ?? 0) || size * it.str.length : Math.abs(it.height ?? 0) || size
    const w = vertical ? Math.abs(it.width ?? 0) || size : Math.abs(it.width ?? 0)
    items.push({ str: normalizeChars(it.str), x: e, y: vertical ? f - h : f, w, h, size, vertical })
  }
  return items
}
