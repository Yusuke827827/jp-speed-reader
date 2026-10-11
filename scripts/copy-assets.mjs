// PDF.js の CMap・標準フォント・wasm と、Tesseract.js の worker・コアを public/ に複製する。
// これらを同梱しておくと、日本語 PDF の表示と OCR がオフラインでも動く。
import { cpSync, mkdirSync, rmSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const nm = join(root, 'node_modules')
const pub = join(root, 'public')

const pdf = join(pub, 'pdfjs')
rmSync(pdf, { recursive: true, force: true })
for (const d of ['cmaps', 'standard_fonts', 'wasm']) {
  const src = join(nm, 'pdfjs-dist', d)
  if (existsSync(src)) cpSync(src, join(pdf, d), { recursive: true })
}

const tess = join(pub, 'tesseract')
rmSync(tess, { recursive: true, force: true })
mkdirSync(tess, { recursive: true })
cpSync(join(nm, 'tesseract.js', 'dist', 'worker.min.js'), join(tess, 'worker.min.js'))
// LSTM 専用のコアだけを使う（日本語の学習データは LSTM 版）
for (const f of [
  'tesseract-core-lstm.wasm.js',
  'tesseract-core-simd-lstm.wasm.js',
  'tesseract-core-relaxedsimd-lstm.wasm.js',
]) {
  cpSync(join(nm, 'tesseract.js-core', f), join(tess, f))
}
console.log('copied pdfjs and tesseract assets to public/')
