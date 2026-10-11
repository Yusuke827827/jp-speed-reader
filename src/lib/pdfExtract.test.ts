// 実際の PDF（public/samples、scripts/make_samples.py で生成）から本文を取り出す統合テスト
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { buildBookText } from './book'
import { itemsToLines, linesToPageTexts } from './layout'
import { toRawItems } from './pdfItems'
import { segmentBook } from './segment'

const root = join(__dirname, '..', '..')
const nm = join(root, 'node_modules', 'pdfjs-dist')

async function extract(name: string) {
  const data = new Uint8Array(readFileSync(join(root, 'public', 'samples', name)))
  const doc = await pdfjs.getDocument({
    data,
    cMapUrl: pathToFileURL(join(nm, 'cmaps')).href + '/',
    cMapPacked: true,
    standardFontDataUrl: pathToFileURL(join(nm, 'standard_fonts')).href + '/',
  }).promise
  const lines = []
  for (let i = 0; i < doc.numPages; i++) {
    const page = await doc.getPage(i + 1)
    lines.push(itemsToLines(toRawItems(await page.getTextContent())))
  }
  await doc.loadingTask.destroy()
  const pages = linesToPageTexts(lines)
  const book = buildBookText(
    pages.map((p, i) => ({ pageIndex: i, text: p.text, contFromPrev: p.contFromPrev })),
    pages.length,
  )
  return { pages, book }
}

// make_samples.py の本文（このプロジェクト用に書いた文章）の一部
const FIRST = '坂の上の図書館は、月曜日だけ休みになる。それを知らずに来たのは、今月に入って二度目だった。'
const LAST_START = 'それだけ言うと、彼女は傘を手に持ったまま'

for (const name of ['sample-horizontal.pdf', 'sample-vertical.pdf']) {
  describe(name, () => {
    it('段落を復元し、柱・ノンブル・ルビを本文に混ぜない', async () => {
      const { pages, book } = await extract(name)
      const paras = book.paragraphs.map((p) => p.text)
      expect(pages[0].vertical).toBe(name.includes('vertical'))
      expect(paras[0]).toBe(FIRST)
      expect(paras[1]).toBe('「今日も閉まってるよ」')
      expect(paras[paras.length - 1].startsWith(LAST_START)).toBe(true)
      expect(paras.length).toBe(12)
      const all = paras.join('')
      expect(all).not.toContain('雨上がりの図書館') // 柱
      expect(all).not.toContain('としょかん') // ルビは本文に混ぜない
      if (name.includes('vertical')) {
        // 縦書きのサンプルには「図書館」にルビ「としょかん」を付けてある
        const p0 = book.paragraphs[0]
        expect(p0.ruby.map((r) => [p0.text.slice(r.start, r.end), r.text])).toContainEqual(['図書館', 'としょかん'])
      }
      expect(all).toContain('午後３時４５分')
      expect(all).toContain('12.5度')
    })
    it('ページをまたぐ段落を 1 つにつなぎ、ページ位置を保持する', async () => {
      const { book } = await extract(name)
      const spanning = book.paragraphs.filter((p) => p.pageMarks.length > 1)
      const crossesPage = book.paragraphs.some((p) => p.pageMarks[0][1] === 1)
      expect(spanning.length + (crossesPage ? 1 : 0)).toBeGreaterThan(0)
      const chunks = segmentBook(book, { mode: 'phrase', phraseTarget: 7 })
      expect(chunks.length).toBeGreaterThan(50)
    })
  })
}
