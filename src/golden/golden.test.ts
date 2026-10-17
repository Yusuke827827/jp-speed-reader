// 正解データ（golden）。今の TypeScript の処理に決まった入力を与えた結果を fixtures/golden/*.json に保存し、
// 毎回それと一致するかを確かめる。iOS（Swift）版へ移植するとき、同じ JSON と一致すれば同じ動きをしていると分かる。
//
// - 文字位置（start / end / offset）はすべて UTF-16 の単位（JavaScript の文字列の添字と同じ）。
//   Swift では String.utf16 / NSString の位置で比べる。
// - 小数は小数点以下 4 桁に丸めてから保存する。
// - 処理を意図して変えたときは `UPDATE_GOLDEN=1 npx vitest run src/golden` で作り直し、差分を確かめてからコミットする。

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs'
import { buildBookText, referenceParagraphs, type BookText } from '../lib/book'
import { itemsToLines, joinLine, linesToPageTexts, type RawItem } from '../lib/layout'
import { normalizeChars, parseRuby, stripNotes } from '../lib/normalize'
import { cleanOcrText } from '../lib/ocrText'
import { toRawItems } from '../lib/pdfItems'
import { segmentBook, splitSentences, type ChunkMode } from '../lib/segment'
import { decodeText, parseTextBook } from '../lib/textImport'
import { buildSchedule } from '../lib/timing'

const root = join(__dirname, '..', '..')
const dir = join(root, 'fixtures', 'golden')
const update = !!process.env.UPDATE_GOLDEN

const round = (v: unknown): unknown =>
  typeof v === 'number' ? Math.round(v * 1e4) / 1e4 : Array.isArray(v) ? v.map(round) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, round(x)])) : v

/** 結果を正解データと比べる（UPDATE_GOLDEN のときは書き出す） */
function golden(name: string, fn: string, input: unknown, expected: unknown) {
  const file = join(dir, `${name}.json`)
  const data = JSON.parse(JSON.stringify({ fn, indexUnit: 'utf16', input: round(input), expected: round(expected) }))
  if (update || !existsSync(file)) {
    mkdirSync(dir, { recursive: true })
    writeFileSync(file, JSON.stringify(data, null, 1) + '\n')
    return
  }
  expect(data).toEqual(JSON.parse(readFileSync(file, 'utf8')))
}

// テスト文はすべてこのプロジェクト用に書いたもの
const CORPUS = {
  ja: [
    '朝の駅は、思ったより静かだった。「おはよう。今日は早いね」と｜千晴《ちはる》は言った。改札の時計は７時４５分を指していて、気温は12.5度しかない。',
    '湊は自転車を押しながら、少し眠そうな顔で手を振った。……それから、二人は川沿いの道を歩いた――鉄橋の上を電車が渡っていく。',
    '𠮟られた子どもは、窓の外の🌙を見上げた。ＰＤＦの２ページ目には、ver.2の説明がある。',
  ],
  en: [
    'Dr. Smith arrived at 3.5 p.m. on Monday. It was late. See Fig. 2 for details, e.g. the map and the timeline.',
    "Reading long documents on a phone is hard, but it gets easier with practice. The internationalization team didn't stop; they revised the report twice.",
  ],
  mixed: ['この論文（Reading Long Documents on Small Screens）では、短い phrase を順に表示する方法を調べた。The results were clear.'],
}

const MODES: ChunkMode[] = ['char', 'short', 'bunsetsu', 'phrase', 'sentence']
const bookOf = (paras: string[]): BookText => buildBookText([{ pageIndex: 0, text: paras.join('\n'), contFromPrev: false }], 1)
const chunkView = (b: BookText, mode: ChunkMode, minChars: number) =>
  segmentBook(b, { mode, phraseTarget: 7, minChars, names: ['千晴', '湊'] }).map((c) => ({
    text: c.text,
    para: c.para,
    start: c.start,
    end: c.end,
    pause: c.pause,
    len: c.len,
    words: c.words,
    name: c.name,
  }))

describe('golden', () => {
  it('normalize', () => {
    const inputs = ['⽇本ｶﾀｶﾅ…', '｜春風《はるかぜ》が吹く［＃「春風」に傍点］', '先生《せんせい》に会った。', 'ﬁnal ﬂow', '黑い犬']
    golden('normalize', 'normalizeChars / stripNotes / parseRuby', inputs, inputs.map((s) => ({ normalizeChars: normalizeChars(s), stripNotes: stripNotes(s), parseRuby: parseRuby(s) })))
  })

  it('splitSentences', () => {
    const inputs = [...CORPUS.ja, ...CORPUS.en, ...CORPUS.mixed, '「行こう。早く」と言った。', 'J. R. Tolkien agreed. 1999. 2000 was next.']
    golden('splitSentences', 'splitSentences', inputs, inputs.map((s) => splitSentences(s)))
  })

  it('joinLine', () => {
    const inputs: [string, string][] = [
      ['this is an exam-', 'ple'],
      ['there was a', 'cat'],
      ['in 2020', 'the team'],
      ['気温は12.', '5度'],
      ['cost 1,', '000 yen'],
      ['坂の上の', '図書館'],
      ['PDFの', 'ファイル'],
      ['as noted (Smith)', 'and others'],
    ]
    golden('joinLine', 'joinLine', inputs, inputs.map(([a, b]) => joinLine(a, b)))
  })

  for (const [lang, paras] of Object.entries(CORPUS)) {
    it(`segmentBook (${lang})`, () => {
      const b = bookOf(paras)
      const expected: Record<string, unknown> = {}
      for (const mode of MODES) for (const minChars of [1, 3]) expected[`${mode}/min${minChars}`] = chunkView(b, mode, minChars)
      golden(`segmentBook-${lang}`, 'segmentBook(buildBookText(paragraphs), { mode, phraseTarget: 7, minChars, names: ["千晴", "湊"] })', { paragraphs: paras }, expected)
    })
  }

  it('buildSchedule', () => {
    const paras = [...CORPUS.ja, ...CORPUS.en, ...CORPUS.mixed]
    const chunks = segmentBook(bookOf(paras), { mode: 'phrase', phraseTarget: 7, minChars: 3, names: ['千晴', '湊'] })
    const expected: Record<string, unknown> = {}
    for (const pauses of [true, false]) {
      const s = buildSchedule(chunks, { cpm: 600, wpm: 250, pauses, pauseScale: 1, nameBoost: true })
      expected[`pauses=${pauses}`] = { weights: [...s.weights], unit: [...s.unit], blocks: s.blocks, limited: s.limited, totalChars: s.totalChars }
    }
    // Swift 版の表示時間の計算を単独で確かめられるよう、分割済みの単位（計算に使う項目だけ）も入力に入れる
    const units = chunks.map((c) => ({ len: c.len, pause: c.pause, words: c.words, name: !!c.name, illust: !!c.illust }))
    golden('buildSchedule', 'buildSchedule(chunks, { cpm: 600, wpm: 250, pauses, pauseScale: 1, nameBoost: true })', { paragraphs: paras, chunks: units, options: { cpm: 600, wpm: 250, pauseScale: 1, nameBoost: true } }, expected)
  })

  it('cleanOcrText', () => {
    const inputs = ['This is an exam-\nple of text that\ncontinues here.\n\nA new paragraph\nstarts.\n', '坂 の 上 の 図 書 館 は 、\n月 曜 日 だ け 休 み に な る 。\n\n「今 日 は」\n']
    golden('cleanOcrText', 'cleanOcrText', inputs, inputs.map((s) => cleanOcrText(s)))
  })

  it('parseTextBook（青空文庫のサンプル）', () => {
    // Buffer の .buffer は Node の共有メモリ全体を指すことがあるので、ファイルの中身だけを写す
    const raw = decodeText(new Uint8Array(readFileSync(join(root, 'public', 'samples', 'sample-aozora.txt'))).buffer)
    golden('parseTextBook-aozora', 'parseTextBook(decodeText(public/samples/sample-aozora.txt))', { file: 'public/samples/sample-aozora.txt' }, parseTextBook(raw))
  })

  // PDF.js が返す断片（RawItem）を入力として保存し、行・段落の組み立ての結果と比べる。
  // iOS では断片の作り方（PDFKit）が違うので、まずこの入力で layout の移植を確かめ、次に同じ PDF の最終的な段落で比べる
  for (const name of ['sample-horizontal.pdf', 'sample-vertical.pdf', 'sample-english-paper.pdf']) {
    it(`layout (${name})`, async () => {
      const nm = join(root, 'node_modules', 'pdfjs-dist')
      const doc = await pdfjs.getDocument({
        data: new Uint8Array(readFileSync(join(root, 'public', 'samples', name))),
        cMapUrl: pathToFileURL(join(nm, 'cmaps')).href + '/',
        cMapPacked: true,
        standardFontDataUrl: pathToFileURL(join(nm, 'standard_fonts')).href + '/',
      }).promise
      const pagesItems: RawItem[][] = []
      for (let i = 0; i < doc.numPages; i++) pagesItems.push(toRawItems(await (await doc.getPage(i + 1)).getTextContent()))
      await doc.loadingTask.destroy()
      // 入力を丸めてから処理し、保存した入力だけで同じ結果を再現できるようにする
      const items = round(pagesItems) as RawItem[][]
      const pages = linesToPageTexts(items.map((it) => itemsToLines(it)))
      const book = buildBookText(pages.map((p, i) => ({ pageIndex: i, text: p.text, contFromPrev: p.contFromPrev })), pages.length)
      golden(`layout-${name.replace('.pdf', '')}`, 'linesToPageTexts(pages.map(itemsToLines)) → buildBookText → referenceParagraphs', { pages: items }, {
        pageTexts: pages,
        paragraphs: book.paragraphs.map((p) => ({ text: p.text, ruby: p.ruby, pageMarks: p.pageMarks })),
        references: [...referenceParagraphs(book)],
      })
    })
  }
})
