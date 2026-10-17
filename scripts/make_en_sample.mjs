// 英語の論文風サンプルPDF（public/samples/sample-english-paper.pdf）を作る。
// 2段組み・両端揃え・行末のハイフン分割・柱・ページ番号・脚注・参考文献・付録を含め、
// 英語の本文抽出を実物の PDF で確かめるのに使う。文章はこのアプリのために書いたもの。
//
//   node scripts/make_en_sample.mjs

import { writeFileSync } from 'node:fs'
import { PDFDocument, StandardFonts } from 'pdf-lib'

const W = 595
const H = 500
const MARGIN = 56
const GUTTER = 22
const COL_W = (W - MARGIN * 2 - GUTTER) / 2
const SIZE = 10
const LEADING = 12.5
const TOP = H - 110 // 1 ページ目の本文の上端（題名の下）
const TOP_N = H - 64 // 2 ページ目以降
const BOTTOM = 80

const TITLE = 'Reading Long Documents on Small Screens'
const AUTHORS = 'A. Example and B. Sample'

/** 本文。見出しは { h }、段落は { p }、参考文献は { ref }。 */
const BODY = [
  { h: '1 Introduction' },
  {
    p: 'Many people now read reports, papers and news articles on a phone. A phone screen shows only a few lines of a page that was designed for paper, so readers zoom, scroll sideways and often lose their place. This study asks whether showing a document one short phrase at a time helps readers keep their place without changing what they understand.',
    note: 'The documents used in this study were written for the study and are not published elsewhere.',
  },
  {
    p: 'Earlier work suggests that eye movements take only a small part of reading time, and that understanding the language is the main limit on speed. We therefore do not claim that phrase display makes reading faster in general. Instead, we look at how often readers stop, go back or give up when the layout of the original page gets in the way.',
  },
  { h: '2 Method' },
  {
    p: 'Twenty-four volunteers read three short reports each. Every report was shown in two ways: as the original two-column page, and as a sequence of short phrases in the centre of the screen. The order of the reports and the order of the two displays were balanced across readers. After each report, readers answered five questions about its content and rated how easy it was to follow.',
  },
  {
    p: 'The phrase display removed running heads, page numbers and footnotes, joined words that had been split across lines, and read the left column before the right column. Readers could pause at any time, step back one phrase, or open the original page to look at a figure.',
  },
  { h: '3 Results' },
  {
    p: 'Readers answered about the same number of questions correctly with both displays. They stopped less often with the phrase display, and most said it was easier to keep their place. Several readers preferred the original page for sections with tables or equations, which suggests that a reader should make it easy to switch between the two views.',
  },
  {
    p: 'These results come from a small group and from short texts written for the study, so they should be treated as a starting point. Larger studies with real papers and longer reading sessions are needed before drawing firm conclusions.',
  },
  { h: 'References' },
  { ref: '[1] A. Example. Reading on small screens: a short review. Journal of Everyday Reading, 12(3):45-60, 2021.' },
  { ref: '[2] B. Sample and C. Writer. Where readers lose their place. Proceedings of the Workshop on Reading, pages 10-18, 2023.' },
  { ref: '[3] D. Author. Phrase display and comprehension. Reading Review, 7:1-9, 2024.' },
  { h: 'Appendix A' },
  { p: 'The five questions for each report asked about its main claim, two supporting facts, one number and the conclusion.' },
]

const doc = await PDFDocument.create()
doc.setTitle(TITLE)
const roman = await doc.embedFont(StandardFonts.TimesRoman)
const bold = await doc.embedFont(StandardFonts.TimesRomanBold)

const width = (s, font = roman, size = SIZE) => font.widthOfTextAtSize(s, size)

/** 段落を行に分ける。入りきらない長い語は、残りが 3 字以上ならハイフンで分ける */
function wrap(text, firstIndent, hang = 0) {
  const words = text.split(' ')
  const lines = []
  let cur = []
  let indent = firstIndent
  const lineWidth = (ws) => width(ws.join(' '))
  while (words.length) {
    const w = words[0]
    const room = COL_W - indent
    if (lineWidth([...cur, w]) <= room) {
      cur.push(words.shift())
      continue
    }
    // ハイフンで分けられるなら、入るだけ前半を入れる
    let split = 0
    for (let k = w.length - 3; k >= 3; k--) {
      if (/[^a-z]/.test(w.slice(k - 1, k + 1))) continue
      if (lineWidth([...cur, w.slice(0, k) + '-']) <= room) {
        split = k
        break
      }
    }
    if (split) {
      cur.push(w.slice(0, split) + '-')
      words[0] = w.slice(split)
    }
    lines.push({ words: cur, indent, justify: true })
    cur = []
    indent = hang
  }
  if (cur.length) lines.push({ words: cur, indent, justify: false })
  return lines
}

let page = null
let pageNo = 0
let col = 0
let y = 0
const footnotes = []

function newPage() {
  page = doc.addPage([W, H])
  pageNo++
  col = 0
  y = pageNo === 1 ? TOP : TOP_N
  if (pageNo === 1) {
    page.drawText(TITLE, { x: (W - width(TITLE, bold, 16)) / 2, y: H - 70, size: 16, font: bold })
    page.drawText(AUTHORS, { x: (W - width(AUTHORS, roman, 11)) / 2, y: H - 88, size: 11, font: roman })
  } else {
    // 柱（2 ページ目以降の上端、小さい字）
    page.drawText(TITLE, { x: (W - width(TITLE, roman, 8)) / 2, y: H - 40, size: 8, font: roman })
  }
  // ページ番号
  const n = String(pageNo)
  page.drawText(n, { x: (W - width(n)) / 2, y: 40, size: SIZE, font: roman })
}

function nextColumn() {
  flushFootnotes()
  if (col === 0) {
    col = 1
    y = pageNo === 1 ? TOP : TOP_N
  } else newPage()
}

/** 段の下端に、その段の脚注を小さい字で置く */
function flushFootnotes() {
  let fy = BOTTOM - 4
  for (const note of footnotes.splice(0).reverse()) {
    const words = note.split(' ')
    const lines = []
    let cur = []
    for (const w of words) {
      if (width([...cur, w].join(' '), roman, 8) > COL_W && cur.length) {
        lines.push(cur.join(' '))
        cur = []
      }
      cur.push(w)
    }
    lines.push(cur.join(' '))
    for (const l of lines.reverse()) {
      page.drawText(l, { x: colX(), y: fy, size: 8, font: roman })
      fy += 10
    }
  }
}

const colX = () => MARGIN + col * (COL_W + GUTTER)

/** 1 行を、語ごとに置く（両端揃えなら語の間を広げる） */
function drawLine(line, font = roman) {
  if (y < BOTTOM + (footnotes.length ? 30 : 0)) nextColumn()
  const natural = line.words.reduce((a, w) => a + width(w, font), 0)
  const gaps = line.words.length - 1
  const space = line.justify && gaps > 0 ? (COL_W - line.indent - natural) / gaps : width(' ', font)
  let x = colX() + line.indent
  for (const w of line.words) {
    page.drawText(w, { x, y, size: SIZE, font })
    x += width(w, font) + space
  }
  y -= LEADING
}

newPage()
for (const block of BODY) {
  if (block.h) {
    y -= 4
    drawLine({ words: block.h.split(' '), indent: 0, justify: false }, bold)
    continue
  }
  if (block.note) {
    footnotes.push(block.note)
  }
  const lines = block.ref ? wrap(block.ref, 0, 12) : wrap(block.p, 12)
  lines.forEach((l, i) => {
    drawLine(l)
    // 脚注の番号（上付きの小さい字）を段落の 1 行目の末尾に付ける
    if (block.note && i === 0) page.drawText('1', { x: colX() + COL_W + 1, y: y + LEADING + 4, size: 5, font: roman })
  })
}
flushFootnotes()

const out = new URL('../public/samples/sample-english-paper.pdf', import.meta.url)
writeFileSync(out, await doc.save())
console.log('wrote', out.pathname, pageNo, 'pages')
