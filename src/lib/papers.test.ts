import { describe, expect, it } from 'vitest'
import { itemsToLines, linesToPageTexts, type RawItem } from './layout'
import { buildBookText, referenceParagraphs } from './book'

// テスト文はすべてこのプロジェクト用に書いたもの

function line(str: string, y: number, size = 10): RawItem {
  return { str, x: 50, y, w: str.length * size * 0.5, h: size, size, vertical: false }
}

describe('脚注', () => {
  it('ページ下部の小さい字の行（脚注）を本文から除く', () => {
    const items = [
      line('The method was tested on three groups of readers', 800),
      line('who each read the same set of reports and answered', 786),
      line('a short list of questions about each one of them.', 772),
      line('Each session took about forty minutes in total and', 758),
      line('the order of the reports was changed for each reader.', 744),
      line('1 The first group was recruited from a local library.', 120, 8),
      line('2 The second group read the reports on a phone screen', 110, 8),
      line('and the third group read them on paper at home.', 100, 8),
    ]
    const [p] = linesToPageTexts([itemsToLines(items)])
    expect(p.text).toContain('changed for each reader.')
    expect(p.text).not.toContain('recruited')
    expect(p.text).not.toContain('third group')
  })
})

describe('参考文献', () => {
  const book = buildBookText(
    [
      {
        pageIndex: 0,
        text: [
          'The results suggest that readers benefit from short phrases.',
          'References',
          '[1] A. Author. A study of reading. Journal of Reading, 2019.',
          '[2] B. Author. Another study. Reading Review, 2021.',
          'Appendix A',
          'The full list of questions is given here.',
        ].join('\n'),
        contFromPrev: false,
      },
    ],
    1,
  )
  it('見出し「References」から、次の見出し（Appendix）の手前までを参考文献とする', () => {
    expect([...referenceParagraphs(book)]).toEqual([1, 2, 3])
  })
  it('日本語の見出し「参考文献」も見つける', () => {
    const ja = buildBookText([{ pageIndex: 0, text: '本文です。\n参考文献\n[1] 山田. 読書の研究. 2020.', contFromPrev: false }], 1)
    expect([...referenceParagraphs(ja)]).toEqual([1, 2])
  })
  it('見出しが無ければ何も除かない', () => {
    const plain = buildBookText([{ pageIndex: 0, text: 'We cite earlier references in the text.\nMore text.', contFromPrev: false }], 1)
    expect(referenceParagraphs(plain).size).toBe(0)
  })
})
