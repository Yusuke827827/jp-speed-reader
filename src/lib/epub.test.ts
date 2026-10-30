// @vitest-environment jsdom
import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { buildBookText } from './book'
import { epubFile, readEpub, resolvePath, EpubError } from './epub'

// テスト用の EPUB はこのプロジェクト用に書いたもの
// jsdom の中では TextEncoder の配列が別物とみなされ、fflate がフォルダと取り違えるので作り直す
const u8 = (s: string) => new Uint8Array(strToU8(s))
const xhtml = (body: string) =>
  `<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>t</title></head><body>${body}</body></html>`

function makeEpub(files: Record<string, string | Uint8Array>): ArrayBuffer {
  const all: Record<string, Uint8Array> = {
    mimetype: u8('application/epub+zip'),
    'META-INF/container.xml': u8(
      '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
    ),
  }
  for (const [k, v] of Object.entries(files)) all[k] = typeof v === 'string' ? u8(v) : v
  const z = zipSync(all)
  return z.buffer.slice(z.byteOffset, z.byteOffset + z.byteLength) as ArrayBuffer
}

const opf = (spine: string, extraManifest = '', rtl = true) => `<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>川沿いの朝</dc:title><dc:creator>確認用の著者</dc:creator></metadata>
<manifest>
<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
<item id="c1" href="text/ch1.xhtml" media-type="application/xhtml+xml"/>
<item id="c2" href="text/ch2.xhtml" media-type="application/xhtml+xml"/>
<item id="img" href="image/p1.png" media-type="image/png"/>
${extraManifest}
</manifest><spine${rtl ? ' page-progression-direction="rtl"' : ''}>${spine}</spine></package>`

const ch1 = xhtml(`
<h1>一</h1>
<p>　<ruby>千晴<rt>ちはる</rt></ruby>は、朝いちばんの電車で
<ruby><rb>湊</rb><rp>（</rp><rt>みなと</rt><rp>）</rp></ruby>の住む町に着いた。</p>
<p><ruby><rb>渡</rb><rt>わた</rt><rb>場</rb><rt>ば</rt></ruby>の跡<img class="gaiji" src="../image/g.png" alt="※"/>を見た。</p>
<div class="illust"><img src="../image/p1.png" alt=""/></div>
<p>改札を出ると、<span class="tcy">12</span>時だった。<br/>川の匂いがした。</p>`)
const ch2 = xhtml(`<h2>二</h2><p>Hello  world,
again.</p>`)
const nav = xhtml(`<nav epub:type="toc"><ol><li><a href="text/ch1.xhtml">一</a></li><li><a href="text/ch2.xhtml#s">二</a></li></ol></nav>`)
const png = new Uint8Array([137, 80, 78, 71, 1, 2, 3])

const basic = () =>
  makeEpub({
    'OEBPS/content.opf': opf('<itemref idref="nav" linear="no"/><itemref idref="c1"/><itemref idref="c2"/>'),
    'OEBPS/nav.xhtml': nav,
    'OEBPS/text/ch1.xhtml': ch1,
    'OEBPS/text/ch2.xhtml': ch2,
    'OEBPS/image/p1.png': png,
  })

describe('EPUB の読み取り', () => {
  it('題名・著者・向きを読む', () => {
    const b = readEpub(basic())
    expect(b.title).toBe('川沿いの朝')
    expect(b.author).toBe('確認用の著者')
    expect(b.vertical).toBe(true)
  })
  it('ルビを記法に直し、XHTML の改行や字下げを消す', () => {
    const b = readEpub(basic())
    const lines = b.pages[0].text.split('\n')
    expect(lines[0]).toBe('一')
    expect(lines[1]).toBe('｜千晴《ちはる》は、朝いちばんの電車で｜湊《みなと》の住む町に着いた。')
    expect(lines[2]).toBe('｜渡《わた》｜場《ば》の跡※を見た。')
  })
  it('段落だけの画像は挿絵のページにし、その後の本文は次のページから', () => {
    const b = readEpub(basic())
    expect(b.pages[1]).toEqual({ text: '', image: 'OEBPS/image/p1.png' })
    expect(b.pages[2].text).toBe('改札を出ると、12時だった。\n川の匂いがした。')
  })
  it('欧文の語の間の空白は残す', () => {
    const b = readEpub(basic())
    expect(b.pages[3].text).toBe('二\nHello world, again.')
  })
  it('目次は nav から取り、ファイルの最初のページに結びつける', () => {
    const b = readEpub(basic())
    expect(b.toc).toEqual([
      { title: '一', page: 0, depth: 0 },
      { title: '二', page: 3, depth: 0 },
    ])
  })
  it('nav が無ければ NCX の目次を使う', () => {
    const ncx = `<?xml version="1.0"?><ncx xmlns="http://www.daisy.org/z3986/2005/ncx/"><navMap><navPoint id="a"><navLabel><text>第一章</text></navLabel><content src="text/ch1.xhtml"/><navPoint id="b"><navLabel><text>第二章</text></navLabel><content src="text/ch2.xhtml"/></navPoint></navPoint></navMap></ncx>`
    const buf = makeEpub({
      'OEBPS/content.opf': opf('<itemref idref="c1"/><itemref idref="c2"/>', '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>', false).replace(' properties="nav"', '').replace('<spine>', '<spine toc="ncx">'),
      'OEBPS/toc.ncx': ncx,
      'OEBPS/text/ch1.xhtml': ch1,
      'OEBPS/text/ch2.xhtml': ch2,
    })
    const b = readEpub(buf)
    expect(b.vertical).toBe(false)
    expect(b.toc).toEqual([
      { title: '第一章', page: 0, depth: 0 },
      { title: '第二章', page: 3, depth: 1 },
    ])
  })
  it('読書画面の本文にすると、ルビが付き、挿絵が段落の間に入る', () => {
    const b = readEpub(basic())
    const text = buildBookText(
      b.pages.map((p, i) => ({ pageIndex: i, text: p.text, contFromPrev: false, image: p.image ? 'illust' : undefined, imagePath: p.image })),
      b.pages.length,
    )
    expect(text.paragraphs[1].text).toBe('千晴は、朝いちばんの電車で湊の住む町に着いた。')
    expect(text.paragraphs[1].ruby.map((r) => r.text)).toEqual(['ちはる', 'みなと'])
    const il = text.paragraphs.find((p) => p.illust)!
    expect(il.illust!.src).toBe('OEBPS/image/p1.png')
  })
  it('挿絵の画像を 1 枚だけ取り出せる', () => {
    expect(epubFile(basic(), 'OEBPS/image/p1.png')).toEqual(png)
    expect(epubFile(basic(), 'OEBPS/image/none.png')).toBeNull()
  })
  it('コピー防止のかかった本は理由を示して止める。フォントだけの難読化は読む', () => {
    const enc = (alg: string, uri: string) =>
      `<?xml version="1.0"?><encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:enc="http://www.w3.org/2001/04/xmlenc#"><enc:EncryptedData><enc:EncryptionMethod Algorithm="${alg}"/><enc:CipherData><enc:CipherReference URI="${uri}"/></enc:CipherData></enc:EncryptedData></encryption>`
    const files = {
      'OEBPS/content.opf': opf('<itemref idref="c1"/>'),
      'OEBPS/text/ch1.xhtml': ch1,
    }
    const drm = makeEpub({ ...files, 'META-INF/encryption.xml': enc('http://www.w3.org/2001/04/xmlenc#aes128-cbc', 'OEBPS/text/ch1.xhtml') })
    expect(() => readEpub(drm)).toThrow(EpubError)
    try {
      readEpub(drm)
    } catch (e) {
      expect((e as EpubError).kind).toBe('drm')
    }
    const font = makeEpub({ ...files, 'META-INF/encryption.xml': enc('http://www.idpf.org/2008/embedding', 'OEBPS/font/a.otf') })
    expect(readEpub(font).pages.length).toBeGreaterThan(0)
  })
  it('ZIP でないファイルは zip の失敗として扱う', () => {
    try {
      readEpub(u8('not an epub').buffer as ArrayBuffer)
      expect.unreachable()
    } catch (e) {
      expect((e as EpubError).kind).toBe('zip')
    }
  })
  it('相対パスを解決する', () => {
    expect(resolvePath('OEBPS/text/', '../image/a%20b.png#x')).toBe('OEBPS/image/a b.png')
  })
})
