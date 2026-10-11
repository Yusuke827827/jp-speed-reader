import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildBookText } from './book'
import { decodeText, parseTextBook } from './textImport'

const root = join(__dirname, '..', '..')

describe('青空文庫形式のテキスト（Shift_JIS）', () => {
  const buf = readFileSync(join(root, 'public', 'samples', 'sample-aozora.txt'))
  const raw = decodeText(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
  const parsed = parseTextBook(raw)
  const book = buildBookText(
    parsed.pages.map((text, i) => ({ pageIndex: i, text, contFromPrev: false })),
    parsed.pages.length,
  )

  it('Shift_JIS を読み、題名と著者を取り出す', () => {
    expect(parsed.title).toBe('川沿いの約束')
    expect(parsed.author).toBe('試作文庫')
  })
  it('記号の説明と底本を本文に含めない', () => {
    const all = book.paragraphs.map((p) => p.text).join('')
    expect(all).not.toContain('記号について')
    expect(all).not.toContain('底本')
    expect(all).not.toContain('［＃')
    expect(book.paragraphs[1].text.startsWith('千晴は、朝いちばんの電車で湊の住む町に着いた。')).toBe(true)
  })
  it('見出しから目次を作る', () => {
    expect(parsed.toc.map((t) => t.title)).toEqual(['一', '二'])
  })
  it('ルビを親文字に結び付ける（｜で区切った 1 文字ずつのルビも含む）', () => {
    const rubies = book.paragraphs.flatMap((p) => p.ruby.map((r) => [p.text.slice(r.start, r.end), r.text]))
    expect(rubies).toContainEqual(['千晴', 'ちはる'])
    expect(rubies).toContainEqual(['堤防', 'ていぼう'])
    expect(rubies).toContainEqual(['渡', 'わた'])
    expect(rubies).toContainEqual(['場', 'ば'])
  })
})

describe('UTF-8 の普通のテキスト', () => {
  it('BOM を外し、空行区切りの段落を 1 つにつなぐ', () => {
    const text = '﻿雨の日は\n図書館へ行く\n\n晴れた日は\n川沿いを歩く\n\n'
    const parsed = parseTextBook(decodeText(new TextEncoder().encode(text).buffer as ArrayBuffer))
    expect(parsed.pages[0].split('\n')).toEqual(['雨の日は図書館へ行く', '晴れた日は川沿いを歩く'])
  })
})
