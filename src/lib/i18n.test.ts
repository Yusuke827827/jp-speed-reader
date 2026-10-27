import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { detectLang, setUiLang, t } from './i18n'
import en from '../i18n/en'

describe('t', () => {
  afterEach(() => setUiLang('ja'))
  it('日本語ではキーの文をそのまま返す', () => {
    setUiLang('ja')
    expect(t('本棚')).toBe('本棚')
  })
  it('英語では辞書の訳を返し、訳が無ければ日本語に戻す', () => {
    setUiLang('en')
    expect(t('本棚')).toBe(en['本棚'])
    expect(t('辞書に無い文')).toBe('辞書に無い文')
  })
  it('{名前} の部分に値を埋め込む', () => {
    setUiLang('ja')
    expect(t('{done} / {total} ページ', { done: 3, total: 10 })).toBe('3 / 10 ページ')
  })
})

describe('detectLang', () => {
  it('端末の言語が日本語なら日本語、それ以外は英語', () => {
    expect(detectLang(['ja-JP', 'en-US'])).toBe('ja')
    expect(detectLang(['en-US'])).toBe('en')
    expect(detectLang(['zh-TW'])).toBe('en')
    expect(detectLang([])).toBe('en')
  })
})

// 画面のソースの t('…') に渡した文が、すべて英語の辞書にあること。
// また、t() の外に日本語の文字列が残っていないこと（コメントと「i18n-ignore」を付けた行は除く）
const root = join(__dirname, '..')
const sources = [
  ...readdirSync(join(root, 'ui'))
    .filter((f) => f.endsWith('.tsx') && !f.endsWith('.test.tsx'))
    .map((f) => join(root, 'ui', f)),
  join(root, 'App.tsx'),
]
const KEY = /\bt\(\s*(['"`])((?:\\.|(?!\1).)*)\1/g
const JA = /[぀-ヿ㐀-鿿！-｠]/

describe('画面の翻訳', () => {
  it('t() に渡した文がすべて英語の辞書にある', () => {
    const missing: string[] = []
    for (const file of sources) {
      for (const m of readFileSync(file, 'utf8').matchAll(KEY)) {
        if (m[1] === '`' && m[2].includes('${')) continue // 埋め込みの key は使わない約束（{name} を使う）
        const key = m[2].replace(/\\'/g, "'").replace(/\\"/g, '"')
        if (!(key in en)) missing.push(`${file.split('/').pop()}: ${key}`)
      }
    }
    expect(missing).toEqual([])
  })
  it('t() の外に日本語の文字列が残っていない', () => {
    const left: string[] = []
    for (const file of sources) {
      // Windows で改行が CRLF になっていても行末の \r を残さない（残るとコメントを取り除けない）
      const lines = readFileSync(file, 'utf8').split(/\r?\n/)
      let inBlock = false
      lines.forEach((raw, i) => {
        let line = raw
        if (inBlock) {
          const end = line.indexOf('*/')
          if (end < 0) return
          line = line.slice(end + 2)
          inBlock = false
        }
        line = line.replace(/\{?\/\*.*?\*\/\}?/g, '')
        const open = line.indexOf('/*')
        if (open >= 0) {
          line = line.slice(0, open)
          inBlock = true
        }
        if (/i18n-ignore/.test(raw)) return
        line = line.replace(KEY, '').replace(/(^|[^:'"`])\/\/.*$/, '$1')
        if (JA.test(line)) left.push(`${file.split('/').pop()}:${i + 1}: ${raw.trim()}`)
      })
    }
    expect(left).toEqual([])
  })
})
