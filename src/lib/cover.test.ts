import { describe, expect, it } from 'vitest'
import { coverPage } from './importer'

const page = (pageIndex: number, source: 'text' | 'empty', image?: 'illust' | 'blank') => ({ pageIndex, source, image })

describe('表紙にするページ', () => {
  it('1 ページ目が絵なら 1 ページ目', () => {
    expect(coverPage([page(0, 'empty', 'illust'), page(1, 'text')])).toBe(0)
    expect(coverPage([page(0, 'text', 'illust'), page(1, 'text')])).toBe(0)
  })
  it('スキャンの本（文字の取れないページ）は 1 ページ目', () => {
    expect(coverPage([page(0, 'empty'), page(1, 'empty')])).toBe(0)
  })
  it('1 ページ目が本文なら、最初の 3 ページの挿絵を使う', () => {
    expect(coverPage([page(0, 'text'), page(1, 'text'), page(2, 'empty', 'illust')])).toBe(2)
  })
  it('本文ばかりなら表紙なし（題名の仮の表紙）', () => {
    expect(coverPage([page(0, 'text'), page(1, 'text'), page(5, 'empty', 'illust')])).toBeNull()
    expect(coverPage([page(0, 'empty', 'blank'), page(1, 'text')])).toBeNull()
  })
})
