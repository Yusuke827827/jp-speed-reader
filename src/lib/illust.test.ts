import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { buildBookText } from './book'
import { area, illustrationRect, imageRects, inkRatio, type OpCodes } from './illust'
import { segmentBook } from './segment'
import { buildSchedule, durationOf, effectiveCpm } from './timing'

const OPS = pdfjs.OPS as unknown as OpCodes

describe('imageRects', () => {
  it('変換行列から画像の位置をページに対する割合で求める（上を 0 とする）', () => {
    // 幅 200・高さ 100 のページの右上 1/4 に、100×50 の画像を置く
    const fn = [OPS.save, OPS.transform, OPS.paintImageXObject, OPS.restore]
    const args = [null, [100, 0, 0, 50, 100, 50], ['img1', 1, 1], null]
    const rects = imageRects(fn, args, OPS, [0, 0, 200, 100])
    expect(rects).toEqual([[0.5, 0, 1, 0.5]])
  })
  it('restore で変換が元に戻る', () => {
    const fn = [OPS.save, OPS.transform, OPS.restore, OPS.transform, OPS.paintImageXObject]
    const args = [null, [1000, 0, 0, 1000, 0, 0], null, [50, 0, 0, 50, 0, 0], ['img', 1, 1]]
    const [r] = imageRects(fn, args, OPS, [0, 0, 100, 100])
    expect(area(r)).toBeCloseTo(0.25)
  })
  it('小さな画像（飾り罫など）は挿絵とみなさない', () => {
    expect(illustrationRect([[0, 0, 0.1, 0.1]])).toBeNull()
    expect(illustrationRect([[0.1, 0.1, 0.9, 0.5]])).toEqual([0.1, 0.1, 0.9, 0.5])
  })
})

describe('inkRatio', () => {
  it('白い画素と黒い画素の割合を数える', () => {
    const data = [255, 255, 255, 255, 0, 0, 0, 255, 255, 255, 255, 255, 250, 250, 250, 255]
    expect(inkRatio(data)).toBe(0.25)
  })
})

describe('挿絵をはさんだ本', () => {
  const book = buildBookText(
    [
      { pageIndex: 0, text: '川沿いの道を歩いていると、', contFromPrev: false },
      { pageIndex: 1, text: '', contFromPrev: false, image: 'illust', illustRect: [0, 0, 1, 1] },
      { pageIndex: 2, text: '向こうから自転車が来た。\n次の段落。', contFromPrev: true },
      { pageIndex: 3, text: '', contFromPrev: false, image: 'blank' },
    ],
    4,
  )
  it('挿絵のページをはさんでも段落を切らず、挿絵は次の段落の前に入る', () => {
    expect(book.paragraphs.map((p) => (p.illust ? `[挿絵${p.illust.page}]` : p.text))).toEqual([
      '川沿いの道を歩いていると、向こうから自転車が来た。',
      '[挿絵1]',
      '次の段落。',
    ])
  })
  it('挿絵は表示時間が決まっていて、文章の速度の計算に含めない', () => {
    const chunks = segmentBook(book, { mode: 'bunsetsu', phraseTarget: 7 })
    const i = chunks.findIndex((c) => c.illust)
    expect(i).toBeGreaterThan(0)
    const s = buildSchedule(chunks, { cpm: 600, pauses: true, pauseScale: 1, illustMs: 3000 })
    expect(durationOf(s, i)).toBe(3000)
    const text = chunks.map((_, k) => k).filter((k) => !chunks[k].illust)
    const ms = text.reduce((a, k) => a + durationOf(s, k), 0)
    const chars = text.reduce((a, k) => a + chunks[k].len, 0)
    expect(Math.abs((chars / ms) * 60000 - 600)).toBeLessThan(6)
    expect(effectiveCpm(chunks, s)).toBeLessThan(600) // 挿絵の時間を含めると遅く見える
  })
})

describe('sample-illustrated.pdf', () => {
  it('挿絵だけのページと、挿絵入りのページの画像を見つける', async () => {
    const root = join(__dirname, '..', '..')
    const data = new Uint8Array(readFileSync(join(root, 'public', 'samples', 'sample-illustrated.pdf')))
    const doc = await pdfjs.getDocument({ data }).promise
    const found: (number[] | null)[] = []
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i)
      const ops = await page.getOperatorList()
      found.push(illustrationRect(imageRects(ops.fnArray, ops.argsArray, OPS, page.view)))
    }
    await doc.loadingTask.destroy()
    expect(found[0]).toBeNull()
    expect(found[3]).toBeNull()
    // 2 ページ目: ほぼ全面。3 ページ目: 上部の一部
    expect(area(found[1] as [number, number, number, number])).toBeGreaterThan(0.6)
    const mixed = found[2] as [number, number, number, number]
    expect(mixed[1]).toBeLessThan(0.1)
    expect(mixed[3]).toBeLessThan(0.45)
  })
})
