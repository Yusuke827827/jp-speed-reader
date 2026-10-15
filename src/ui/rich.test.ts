import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { RichText } from './rich'
import { gapBefore, type Paragraph } from '../lib/book'

const para: Paragraph = { text: 'It was late. See Fig. 2 now.', ruby: [], pageMarks: [[0, 0]], globalStart: 0 }
const textOf = (keepSpaces: boolean) =>
  renderToStaticMarkup(
    createElement(RichText, { para, start: 0, end: 6, names: [], opts: { ruby: false, colors: false, keepSpaces } }),
  ).replace(/<[^>]+>/g, '')

describe('RichText（欧文）', () => {
  it('中央表示では、単語の間の空白を詰められない空白として描く', () => {
    expect(textOf(true)).toBe('It was')
  })
  it('全文パネルでは、折り返せるよう普通の空白のまま描く', () => {
    expect(textOf(false)).toBe('It was')
  })
})

describe('gapBefore', () => {
  it('前の単位との間の空白を返す', () => {
    expect(gapBefore(para, 12, 13)).toBe(' ')
    expect(gapBefore(para, 13, 13)).toBe('')
  })
})
