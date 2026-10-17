// 英語の論文風サンプル PDF（public/samples、scripts/make_en_sample.mjs で生成）から本文を取り出す統合テスト。
// 2 段組み・両端揃え（語ごとの断片）・行末のハイフン分割・柱・ページ番号・段の下の脚注・参考文献・付録を含む
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { buildBookText, referenceParagraphs } from './book'
import { itemsToLines, linesToPageTexts } from './layout'
import { toRawItems } from './pdfItems'
import { segmentBook } from './segment'

const root = join(__dirname, '..', '..')
const nm = join(root, 'node_modules', 'pdfjs-dist')

async function extract() {
  const data = new Uint8Array(readFileSync(join(root, 'public', 'samples', 'sample-english-paper.pdf')))
  const doc = await pdfjs.getDocument({ data, standardFontDataUrl: pathToFileURL(join(nm, 'standard_fonts')).href + '/' }).promise
  const lines = []
  for (let i = 0; i < doc.numPages; i++) lines.push(itemsToLines(toRawItems(await (await doc.getPage(i + 1)).getTextContent())))
  await doc.loadingTask.destroy()
  const pages = linesToPageTexts(lines)
  return buildBookText(
    pages.map((p, i) => ({ pageIndex: i, text: p.text, contFromPrev: p.contFromPrev })),
    pages.length,
  )
}

describe('sample-english-paper.pdf', () => {
  it('題名・著者・見出しを別の段落にする', async () => {
    const paras = (await extract()).paragraphs.map((p) => p.text)
    expect(paras[0]).toBe('Reading Long Documents on Small Screens')
    expect(paras[1]).toBe('A. Example and B. Sample')
    expect(paras).toContain('1 Introduction')
    expect(paras).toContain('2 Method')
  })
  it('柱・ページ番号・段の下の脚注を本文に混ぜない', async () => {
    const paras = (await extract()).paragraphs.map((p) => p.text)
    const all = paras.join('\n')
    expect(all.split('Reading Long Documents on Small Screens').length).toBe(2) // 題名の 1 回だけ（柱は除く）
    expect(all).not.toContain('documents used in this study')
    expect(paras.some((p) => /^[0-9]+$/.test(p))).toBe(false)
  })
  it('段・ページをまたぐ文と、行末でハイフン分割された語をつなぐ', async () => {
    const book = await extract()
    const refs = referenceParagraphs(book)
    const body = book.paragraphs.filter((_, i) => !refs.has(i)).map((p) => p.text)
    expect(body.join('\n')).toContain('readers answered five questions about its content and rated how easy it was to follow.')
    for (const p of body) expect(p).not.toMatch(/[a-z]-\s[a-z]/) // 行末のハイフンの残り（questi- ons など）が無い
    expect(body.join('\n')).toContain('the same number of questions correctly')
  })
  it('参考文献だけを飛ばす対象にし、付録は読む', async () => {
    const book = await extract()
    const refs = referenceParagraphs(book)
    const paras = book.paragraphs.map((p) => p.text)
    expect(refs.has(paras.indexOf('References'))).toBe(true)
    const appendix = paras.indexOf('Appendix A')
    expect(appendix).toBeGreaterThan(0)
    expect(refs.has(appendix)).toBe(false)
    expect(refs.has(paras.length - 1)).toBe(false)
  })
  it('英語として単語単位に分ける', async () => {
    const chunks = segmentBook(await extract(), { mode: 'phrase', phraseTarget: 7 })
    expect(chunks.filter((c) => c.words !== undefined).length).toBeGreaterThan(chunks.length * 0.9)
  })
})
