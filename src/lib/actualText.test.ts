import { describe, expect, it } from 'vitest'
import { collectActualText, patchToUnicode } from './actualText'
import { normalizeChars, parseRuby } from './normalize'

describe('ActualText による文字対応表の修復', () => {
  // 縦の「ー」(30FC) と小書きの「っ」(3063) を ActualText で示した描画命令
  const content = [
    'BT /F4 12 Tf',
    '0 -20 Td <0901> Tj',
    '/Span<</ActualText <FEFF30FC> >> BDC',
    '0 -20 Td <2417> Tj',
    'EMC',
    '/Span<</ActualText <FEFF3063> >> BDC <2432> Tj EMC',
    '/F5 10 Tf',
    '/Span<</ActualText <FEFF3063> >> BDC <0001> Tj <0002> Tj EMC',
    'ET',
  ].join('\n')

  it('フォントごとに、字形番号と ActualText の文字を対応付ける（字形が複数の注記は使わない）', () => {
    const m = collectActualText(content)
    expect([...m.get('F4')!]).toEqual([
      [0x2417, 'ー'],
      [0x2432, 'っ'],
    ])
    expect(m.get('F5')).toBeUndefined()
  })

  it('ToUnicode の 0000 だけを書き換える', () => {
    const cmap = '3 beginbfchar\n<0901> <3042>\n<2417> <0000>\n<2432> <0000>\nendbfchar'
    const r = patchToUnicode(cmap, collectActualText(content).get('F4')!)
    expect(r.fixed).toBe(2)
    expect(r.text).toBe('3 beginbfchar\n<0901> <3042>\n<2417> <30FC>\n<2432> <3063>\nendbfchar')
  })
})

describe('縦書き用の文字の正規化', () => {
  it('縦書き用の句読点・括弧と部首用の文字を、普通の文字に戻す', () => {
    const vertical = String.fromCharCode(0xfe41) + '待' + String.fromCharCode(0xfe11) + 'て' + String.fromCharCode(0xfe12, 0xfe42)
    expect(normalizeChars(vertical)).toBe('「待、て。」')
    expect(normalizeChars(String.fromCharCode(0x2ef2) + '山')).toBe('亀山')
  })
  it('本文中の《》で囲んだ語（かなだけでないもの）はルビとみなさず、そのまま残す', () => {
    expect(parseRuby('スキル《大賢者》を得た').text).toBe('スキル《大賢者》を得た')
    expect(parseRuby('能力《スキル》を得た')).toEqual({ text: '能力を得た', ruby: [{ start: 0, end: 2, text: 'スキル' }] })
  })
})
