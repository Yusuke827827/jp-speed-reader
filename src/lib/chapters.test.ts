import { describe, expect, it } from 'vitest'
import { chapterTimes } from './timing'

// 単位は 10 個、どれも 1 秒。見出しは 0・4（その中に小見出し 6）・8 番目から始まる
const one = () => 1000

describe('目次の章ごとの時間', () => {
  it('読み終えた章・途中の章・まだの章を分け、途中は残りの時間を出す', () => {
    const r = chapterTimes([0, 4, 6, 8], [0, 0, 1, 0], 10, 5, one)
    expect(r).toEqual([
      { state: 'done', ms: 0 },
      { state: 'current', ms: 3000 },
      { state: 'todo', ms: 2000 },
      { state: 'todo', ms: 2000 },
    ])
  })
  it('小見出しは親の章に含め、親の章は次の同じ深さの見出しまで', () => {
    const r = chapterTimes([0, 4, 6, 8], [0, 0, 1, 0], 10, 0, one)
    expect(r.map((x) => x.ms)).toEqual([4000, 4000, 2000, 2000])
  })
  it('最後の章は本の終わりまで', () => {
    const r = chapterTimes([0, 8], [0, 0], 10, 9, one)
    expect(r).toEqual([
      { state: 'done', ms: 0 },
      { state: 'current', ms: 1000 },
    ])
  })
})

describe('見出しの位置', () => {
  it('1 ページに見出しが 2 つあっても、それぞれの段落を見つける', async () => {
    const { buildBookText, headingPositions } = await import('./book')
    const book = buildBookText([{ pageIndex: 0, text: '一\n雨が降った。\n二\n晴れた。', contFromPrev: false }], 1)
    const pos = headingPositions(book, [
      { title: '一', page: 0 },
      { title: '二', page: 0 },
    ])
    expect(pos).toEqual([
      { para: 0, offset: 0 },
      { para: 2, offset: 0 },
    ])
  })
})
