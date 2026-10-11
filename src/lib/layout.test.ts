import { describe, expect, it } from 'vitest'
import { itemsToLines, linesToPageTexts, type RawItem } from './layout'
import { normalizeChars, stripAozoraNotation, garbledRatio, parseRuby } from './normalize'
import { buildBookText } from './book'

// 横書き: 1 行 = 1 断片の単純なページを作る
function hPage(lines: string[], opts: { header?: string; footer?: string } = {}): RawItem[] {
  const items: RawItem[] = []
  const size = 10
  let y = 800
  if (opts.header) items.push({ str: opts.header, x: 50, y: 830, w: opts.header.length * size, h: size, size, vertical: false })
  for (const l of lines) {
    items.push({ str: l, x: 50, y, w: l.length * size, h: size, size, vertical: false })
    y -= 16
  }
  if (opts.footer) items.push({ str: opts.footer, x: 200, y: 40, w: opts.footer.length * size, h: size, size, vertical: false })
  return items
}

// 縦書き: 1 文字 = 1 断片、列は右から左
function vPage(cols: string[]): RawItem[] {
  const items: RawItem[] = []
  const size = 10
  cols.forEach((col, ci) => {
    const x = 500 - ci * 16
    ;[...col].forEach((ch, i) => {
      items.push({ str: ch, x, y: 800 - (i + 1) * size, w: size, h: size, size, vertical: true })
    })
  })
  return items
}

describe('normalize', () => {
  it('康熙部首と半角カナを直し、三点リーダーは残す', () => {
    expect(normalizeChars('⽇本ｶﾀｶﾅ…')).toBe('日本カタカナ…')
  })
  it('青空文庫のルビと注記を外す', () => {
    expect(stripAozoraNotation('｜春風《はるかぜ》が吹く［＃「春風」に傍点］')).toBe('春風が吹く')
  })
  it('私用領域の文字が多ければ文字化けとみなす', () => {
    expect(garbledRatio('あ')).toBeGreaterThan(0.5)
  })
})

describe('横書きページ', () => {
  const lines = [
    '　坂の上の図書館は、月曜日だけ',
    '休みになる。',
    '「今日は開いてる？」',
    '　僕は扉の前で首をかしげた。',
  ]
  it('字下げと会話の括弧で段落を分け、行をつなぐ', () => {
    const others = [['　雨が上がった。'], ['　夜になった。']]
    const pages = [lines, ...others].map((ls, n) =>
      itemsToLines(hPage(ls, { header: '坂の上の図書館', footer: String(n + 1) })),
    )
    const [p] = linesToPageTexts(pages)
    expect(p.text.split('\n')).toEqual([
      '坂の上の図書館は、月曜日だけ休みになる。',
      '「今日は開いてる？」',
      '僕は扉の前で首をかしげた。',
    ])
    expect(p.contFromPrev).toBe(false)
  })
  it('段落の途中から始まるページは前ページの続きとみなす', () => {
    const page = itemsToLines(hPage(['続きの文です。']))
    expect(linesToPageTexts([page])[0].contFromPrev).toBe(true)
  })
})

describe('縦書きページ', () => {
  it('右の列から読み、ルビ（小さい文字）を親文字に結び付ける', () => {
    const items = vPage(['　川の水は', '冷たかった。'])
    // ルビ「かわ」を「川」の右横に小さく置く
    items.push({ str: 'かわ', x: 512, y: 780, w: 5, h: 10, size: 5, vertical: true })
    const pages = linesToPageTexts([itemsToLines(items)])
    expect(pages[0].vertical).toBe(true)
    expect(pages[0].text).toBe('｜川《かわ》の水は冷たかった。')
  })
})

describe('parseRuby', () => {
  it('｜付きと漢字の直後の両方の記法を読む', () => {
    const r = parseRuby('｜春風《はるかぜ》が吹く町で、先生《せんせい》に会った。')
    expect(r.text).toBe('春風が吹く町で、先生に会った。')
    expect(r.ruby.map((x) => [r.text.slice(x.start, x.end), x.text])).toEqual([
      ['春風', 'はるかぜ'],
      ['先生', 'せんせい'],
    ])
  })
  it('ページをまたぐ段落でもルビの位置をずらす', () => {
    const b = buildBookText(
      [
        { pageIndex: 0, text: '駅の前で', contFromPrev: false },
        { pageIndex: 1, text: '｜湊《みなと》を待った。', contFromPrev: true },
      ],
      2,
    )
    const p = b.paragraphs[0]
    expect(p.text).toBe('駅の前で湊を待った。')
    expect(p.ruby).toEqual([{ start: 4, end: 5, text: 'みなと' }])
  })
})
