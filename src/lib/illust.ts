// 挿絵の検出。ブラウザに依存しない計算だけを置き、Node 上のテストからも使えるようにする。

/** ページ上の範囲。左上を (0, 0)、右下を (1, 1) とした割合 [x0, y0, x1, y1] */
export type Rect = [number, number, number, number]

export const FULL_PAGE: Rect = [0, 0, 1, 1]

/** PDF.js の OPS のうち、ここで使う命令の番号 */
export interface OpCodes {
  save: number
  restore: number
  transform: number
  paintImageXObject: number
  paintInlineImageXObject: number
  paintImageMaskXObject: number
  paintFormXObjectBegin: number
  paintFormXObjectEnd: number
}

type M = [number, number, number, number, number, number]

/** 行列 m を先に、ctm を後にかける（PDF の cm 演算子と同じ順） */
function compose(ctm: M, m: M): M {
  return [
    m[0] * ctm[0] + m[1] * ctm[2],
    m[0] * ctm[1] + m[1] * ctm[3],
    m[2] * ctm[0] + m[3] * ctm[2],
    m[2] * ctm[1] + m[3] * ctm[3],
    m[4] * ctm[0] + m[5] * ctm[2] + ctm[4],
    m[4] * ctm[1] + m[5] * ctm[3] + ctm[5],
  ]
}

/**
 * ページの描画命令から、画像が置かれた範囲を求める。
 * 画像は単位正方形を現在の変換行列で写した位置に描かれるので、その 4 隅から外接矩形をとる。
 * view はページの範囲 [x0, y0, x1, y1]（PDF の座標、y は上向き）。
 */
export function imageRects(fnArray: ArrayLike<number>, argsArray: ArrayLike<unknown>, ops: OpCodes, view: number[]): Rect[] {
  const [vx0, vy0, vx1, vy1] = view
  const w = vx1 - vx0
  const h = vy1 - vy0
  let ctm: M = [1, 0, 0, 1, 0, 0]
  const stack: M[] = []
  const out: Rect[] = []
  for (let i = 0; i < fnArray.length; i++) {
    const fn = fnArray[i]
    const args = argsArray[i] as unknown[] | null
    if (fn === ops.save) stack.push(ctm)
    else if (fn === ops.restore) ctm = stack.pop() ?? ctm
    else if (fn === ops.transform && args) ctm = compose(ctm, args as unknown as M)
    else if (fn === ops.paintFormXObjectBegin) {
      stack.push(ctm)
      const m = (args?.[0] as M | undefined) ?? null
      if (m && m.length === 6) ctm = compose(ctm, m)
    } else if (fn === ops.paintFormXObjectEnd) ctm = stack.pop() ?? ctm
    else if (fn === ops.paintImageXObject || fn === ops.paintInlineImageXObject || fn === ops.paintImageMaskXObject) {
      const pts = [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ].map(([x, y]) => [ctm[0] * x + ctm[2] * y + ctm[4], ctm[1] * x + ctm[3] * y + ctm[5]])
      const xs = pts.map((p) => (p[0] - vx0) / w)
      const ys = pts.map((p) => 1 - (p[1] - vy0) / h)
      const r: Rect = [clamp(Math.min(...xs)), clamp(Math.min(...ys)), clamp(Math.max(...xs)), clamp(Math.max(...ys))]
      if (area(r) > 0.005) out.push(r)
    }
  }
  return out
}

const clamp = (v: number) => Math.max(0, Math.min(1, v))

export function area(r: Rect): number {
  return Math.max(0, r[2] - r[0]) * Math.max(0, r[3] - r[1])
}

/** 一定以上の大きさの画像をまとめた範囲。無ければ null */
export function illustrationRect(rects: Rect[], minArea = 0.12): Rect | null {
  const big = rects.filter((r) => area(r) >= minArea)
  if (big.length === 0) return null
  return [Math.min(...big.map((r) => r[0])), Math.min(...big.map((r) => r[1])), Math.max(...big.map((r) => r[2])), Math.max(...big.map((r) => r[3]))]
}

/** RGBA の画素のうち、白に近くない画素の割合。白紙かどうかの判定に使う */
export function inkRatio(data: ArrayLike<number>): number {
  let ink = 0
  const n = data.length / 4
  for (let i = 0; i < data.length; i += 4) {
    const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
    if (lum < 200) ink++
  }
  return n ? ink / n : 0
}

/** これより塗りが少ないページは白紙とみなす */
export const BLANK_INK = 0.004
