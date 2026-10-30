// EPUB の取り込み: 展開 → 構成（OPF）→ 本文（XHTML）を、テキスト取り込みと同じ「仮のページ」にする。
//
// - 本文の段落は 1 行 1 段落、ルビは ｜漢字《かんじ》 の記法に直す（読むときに book.ts が解釈する）。
// - 段落だけの画像（挿絵）は、本文のない挿絵のページにする。文中の小さな画像（外字など）は代替テキストに置き換える。
// - 目次は EPUB 3 の nav、無ければ EPUB 2 の NCX から取り、各項目が指すファイルの最初のページに結びつける。
// - コピー防止（DRM）のかかった本文は読めないので、encryption.xml で見分けて理由を示す。
// 画像はここでは展開しない（読むときに必要な 1 枚だけを取り出す）。

import { strFromU8, unzipSync } from 'fflate'
import type { TocEntry } from './db'
import { normalizeChars } from './normalize'
import { TEXT_PAGE_CHARS } from './textImport'

export type EpubErrorKind = 'zip' | 'drm' | 'structure' | 'empty'

export class EpubError extends Error {
  kind: EpubErrorKind
  constructor(kind: EpubErrorKind, message: string) {
    super(message)
    this.kind = kind
  }
}

export interface EpubPage {
  /** 段落は \n 区切り、ルビ記法を含む。挿絵のページは空 */
  text: string
  /** 挿絵のページなら、EPUB の中の画像の場所 */
  image?: string
}

export interface EpubBook {
  title?: string
  author?: string
  /** 右から左へめくる本（日本語の縦書きの本） */
  vertical: boolean
  pages: EpubPage[]
  toc: TocEntry[]
  /** 表紙の画像の場所 */
  cover?: string
}

const IMAGE_EXT = /\.(jpe?g|png|gif|webp|svg|avif|bmp)$/i
const BLOCKS = new Set(['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote', 'section', 'article', 'aside', 'header', 'footer', 'figure', 'figcaption', 'dt', 'dd', 'tr', 'pre', 'hr', 'table', 'ul', 'ol', 'dl', 'body'])
// 全角の空白は本文の一部なので残し、半角の空白・改行だけをまとめる
const SPACES = /[ \t\r\n]+/g
const CJK = String.raw`\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー、。「」『』（）！？…―｜《》`
const CJK_SPACE = new RegExp(`(?<=[${CJK}]) +| +(?=[${CJK}])`, 'gu')
const SKIP = new Set(['script', 'style', 'head', 'rp', 'nav', 'title'])

/** dir（末尾に / あり）から見た href を、EPUB の中の場所にする */
export function resolvePath(dir: string, href: string): string {
  const clean = href.split('#')[0]
  let path: string
  try {
    path = decodeURIComponent(clean)
  } catch {
    path = clean
  }
  const parts = (path.startsWith('/') ? path.slice(1) : dir + path).split('/')
  const out: string[] = []
  for (const p of parts) {
    if (p === '..') out.pop()
    else if (p !== '.' && p !== '') out.push(p)
  }
  return out.join('/')
}

const dirOf = (path: string) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : '')

function parseXml(text: string, html = false): Document {
  const doc = new DOMParser().parseFromString(text, html ? 'text/html' : 'application/xhtml+xml')
  // XHTML として壊れているファイルは、HTML として読み直す
  if (!html && doc.getElementsByTagName('parsererror').length > 0) return new DOMParser().parseFromString(text, 'text/html')
  return doc
}

const byLocal = (root: Document | Element, name: string) => [...root.getElementsByTagName('*')].filter((e) => e.localName === name)
const localName = (n: Node) => (n as Element).localName?.toLowerCase() ?? ''

/** コピー防止で本文が暗号化されているか（フォントだけの難読化は読めるので除く） */
function isDrm(files: Record<string, Uint8Array>): boolean {
  if (files['META-INF/rights.xml']) return true
  const enc = files['META-INF/encryption.xml']
  if (!enc) return false
  const doc = parseXml(strFromU8(enc))
  return byLocal(doc, 'EncryptedData').some((d) => {
    const alg = byLocal(d, 'EncryptionMethod')[0]?.getAttribute('Algorithm') ?? ''
    const uri = byLocal(d, 'CipherReference')[0]?.getAttribute('URI') ?? ''
    const fontOnly = /idpf\.org\/2008\/embedding|ns\.adobe\.com\/pdf\/enc#RC/.test(alg)
    return !fontOnly && /\.(x?html?|xml)$/i.test(uri)
  })
}

/** 1 つの XHTML の本文を、段落（行）と挿絵の並びにする */
export function xhtmlBlocks(doc: Document, dir: string): ({ text: string; heading?: number } | { image: string })[] {
  const out: ({ text: string; heading?: number } | { image: string })[] = []
  let line = ''
  let heading: number | undefined
  const flush = () => {
    // 和文の間の空白（XHTML の改行の名残）は消し、欧文の語の間の空白は残す
    const t = normalizeChars(line.replace(SPACES, ' ').replace(CJK_SPACE, ''))
      .replace(/^[\s　]+/, '')
      .trimEnd()
    if (t) out.push(heading ? { text: t, heading } : { text: t })
    line = ''
    heading = undefined
  }
  const blockOf = (el: Element) => {
    let e: Element | null = el.parentElement
    while (e && !BLOCKS.has(localName(e))) e = e.parentElement
    return e
  }
  const imageHref = (el: Element) => el.getAttribute('src') ?? el.getAttribute('href') ?? el.getAttributeNS('http://www.w3.org/1999/xlink', 'href') ?? ''

  const ruby = (el: Element) => {
    const bases: string[] = []
    const reads: string[] = []
    let base = ''
    for (const c of el.childNodes) {
      const n = localName(c)
      if (n === 'rt') {
        bases.push(base)
        base = ''
        reads.push(c.textContent ?? '')
      } else if (n === 'rp' || n === 'rtc') continue
      else base += c.textContent ?? ''
    }
    if (base) bases.push(base)
    if (reads.length === 0) return bases.join('')
    // <rb>漢</rb><rt>かん</rt><rb>字</rb><rt>じ</rt> のように組になっていれば 1 組ずつ
    if (bases.length === reads.length) return bases.map((b, i) => (reads[i].trim() ? `｜${b.trim()}《${reads[i].trim()}》` : b)).join('')
    return `｜${bases.join('').trim()}《${reads.join('').trim()}》`
  }

  const walk = (node: Node) => {
    if (node.nodeType === 3) {
      line += (node.nodeValue ?? '').replace(SPACES, ' ')
      return
    }
    if (node.nodeType !== 1) return
    const el = node as Element
    const name = localName(el)
    if (SKIP.has(name)) return
    if (name === 'ruby') {
      line += ruby(el)
      return
    }
    if (name === 'br') {
      flush()
      return
    }
    if (name === 'img' || name === 'image') {
      const href = imageHref(el)
      const block = blockOf(el)
      const alone = !block || !(block.textContent ?? '').trim()
      const small = /gaiji|inline/i.test(el.getAttribute('class') ?? '')
      if (href && alone && !small) {
        flush()
        out.push({ image: resolvePath(dir, href) })
      } else line += el.getAttribute('alt') ?? ''
      return
    }
    const block = BLOCKS.has(name)
    if (block) flush()
    const h = /^h([1-6])$/.exec(name)
    for (const c of el.childNodes) walk(c)
    if (h && line.trim()) heading = Number(h[1])
    if (block) flush()
  }
  const body = doc.getElementsByTagName('body')[0] ?? doc.documentElement
  walk(body)
  flush()
  return out
}

interface NavPoint {
  title: string
  href: string
  depth: number
}

function navToc(doc: Document, dir: string): NavPoint[] {
  const navs = byLocal(doc, 'nav')
  const nav = navs.find((n) => (n.getAttribute('epub:type') ?? n.getAttributeNS('http://www.idpf.org/2007/ops', 'type') ?? '').includes('toc')) ?? navs[0]
  if (!nav) return []
  const out: NavPoint[] = []
  const walk = (ol: Element, depth: number) => {
    for (const li of [...ol.children].filter((c) => localName(c) === 'li')) {
      const a = [...li.children].find((c) => localName(c) === 'a' || localName(c) === 'span')
      const href = a?.getAttribute('href')
      const title = (a?.textContent ?? '').replace(/\s+/g, ' ').trim()
      if (href && title) out.push({ title, href: resolvePath(dir, href), depth })
      const sub = [...li.children].find((c) => localName(c) === 'ol')
      if (sub) walk(sub, depth + 1)
    }
  }
  const ol = [...nav.children].find((c) => localName(c) === 'ol')
  if (ol) walk(ol, 0)
  return out
}

function ncxToc(doc: Document, dir: string): NavPoint[] {
  const out: NavPoint[] = []
  const walk = (el: Element, depth: number) => {
    for (const np of [...el.children].filter((c) => c.localName === 'navPoint')) {
      const title = (byLocal(np, 'text')[0]?.textContent ?? '').replace(/\s+/g, ' ').trim()
      const src = byLocal(np, 'content')[0]?.getAttribute('src')
      if (title && src) out.push({ title, href: resolvePath(dir, src), depth })
      walk(np, depth + 1)
    }
  }
  const map = byLocal(doc, 'navMap')[0]
  if (map) walk(map, 0)
  return out
}

export function readEpub(buf: ArrayBuffer): EpubBook {
  let files: Record<string, Uint8Array>
  try {
    // 画像は読むときに取り出すので、ここでは展開しない
    files = unzipSync(new Uint8Array(buf), { filter: (f) => !IMAGE_EXT.test(f.name) })
  } catch {
    throw new EpubError('zip', 'not a zip')
  }
  if (isDrm(files)) throw new EpubError('drm', 'drm')
  const text = (path: string) => (files[path] ? strFromU8(files[path]) : null)

  const container = text('META-INF/container.xml')
  const opfPath = container ? byLocal(parseXml(container), 'rootfile')[0]?.getAttribute('full-path') : null
  const opfText = opfPath ? text(opfPath) : null
  if (!opfPath || !opfText) throw new EpubError('structure', 'no opf')
  const opf = parseXml(opfText)
  const opfDir = dirOf(opfPath)

  const title = byLocal(opf, 'title')[0]?.textContent?.trim() || undefined
  const author = byLocal(opf, 'creator')[0]?.textContent?.trim() || undefined
  const manifest = new Map<string, { href: string; type: string; props: string }>()
  for (const it of byLocal(opf, 'item')) {
    const id = it.getAttribute('id')
    const href = it.getAttribute('href')
    if (id && href) manifest.set(id, { href: resolvePath(opfDir, href), type: it.getAttribute('media-type') ?? '', props: it.getAttribute('properties') ?? '' })
  }
  // 表紙: EPUB 3 の cover-image、無ければ EPUB 2 の <meta name="cover">
  const coverId = byLocal(opf, 'meta').find((m) => m.getAttribute('name') === 'cover')?.getAttribute('content')
  const cover = [...manifest.values()].find((m) => m.props.split(/\s+/).includes('cover-image'))?.href ?? (coverId ? manifest.get(coverId)?.href : undefined)
  const spineEl = byLocal(opf, 'spine')[0]
  const vertical = spineEl?.getAttribute('page-progression-direction') === 'rtl'
  const spine = byLocal(opf, 'itemref')
    .filter((r) => r.getAttribute('linear') !== 'no')
    .map((r) => manifest.get(r.getAttribute('idref') ?? ''))
    .filter((m): m is { href: string; type: string; props: string } => !!m && /html|xml/.test(m.type))

  // 本文を仮のページに分ける。ファイル（多くは章）が変わるところでページを改める
  const pages: EpubPage[] = []
  const firstPage = new Map<string, number>()
  const headings: TocEntry[] = []
  for (const item of spine) {
    const src = text(item.href)
    if (src === null) continue
    const blocks = xhtmlBlocks(parseXml(src, /html$/.test(item.href) && !/xhtml/.test(item.type)), dirOf(item.href))
    firstPage.set(item.href, pages.length)
    let cur: string[] = []
    let size = 0
    const close = () => {
      if (cur.length) pages.push({ text: cur.join('\n') })
      cur = []
      size = 0
    }
    for (const b of blocks) {
      if ('image' in b) {
        close()
        pages.push({ text: '', image: b.image })
        continue
      }
      if (size >= TEXT_PAGE_CHARS) close()
      if (b.heading && b.heading <= 3) headings.push({ title: b.text.replace(/《[^》]*》|｜/g, ''), page: pages.length, depth: b.heading - 1 })
      cur.push(b.text)
      size += b.text.length
    }
    close()
  }
  if (!pages.some((p) => p.text.trim())) throw new EpubError('empty', 'no text')

  // 目次: nav → NCX → 本文の見出し の順に使う
  let points: NavPoint[] = []
  const navItem = [...manifest.values()].find((m) => m.props.split(/\s+/).includes('nav'))
  const navText = navItem ? text(navItem.href) : null
  if (navText) points = navToc(parseXml(navText), dirOf(navItem!.href))
  if (points.length === 0) {
    const ncxId = spineEl?.getAttribute('toc')
    const ncx = (ncxId && manifest.get(ncxId)) || [...manifest.values()].find((m) => m.type === 'application/x-dtbncx+xml')
    const ncxText = ncx ? text(ncx.href) : null
    if (ncxText) points = ncxToc(parseXml(ncxText), dirOf(ncx!.href))
  }
  const toc = points.filter((p) => firstPage.has(p.href)).map((p) => ({ title: p.title, page: firstPage.get(p.href)!, depth: Math.min(p.depth, 2) }))
  return { title, author, vertical, pages, toc: toc.length ? toc : headings, cover: cover && IMAGE_EXT.test(cover) ? cover : undefined }
}

/** EPUB の中の 1 つのファイル（挿絵の画像）を取り出す */
export function epubFile(buf: ArrayBuffer, path: string): Uint8Array | null {
  const files = unzipSync(new Uint8Array(buf), { filter: (f) => f.name === path })
  return files[path] ?? null
}
