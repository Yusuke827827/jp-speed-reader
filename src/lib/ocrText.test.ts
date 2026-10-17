import { describe, expect, it } from 'vitest'
import { cleanOcrText, shouldTryEnglish } from './ocrText'

// テスト文はすべてこのプロジェクト用に書いたもの

describe('cleanOcrText（英語）', () => {
  it('行をまたぐ英単語に空白を入れ、行末のハイフンをつなぐ', () => {
    const raw = 'This is an exam-\nple of text that\ncontinues here.\n\nA new paragraph\nstarts.\n'
    expect(cleanOcrText(raw).text).toBe('This is an example of text that continues here.\nA new paragraph starts.')
  })
})

describe('cleanOcrText（日本語）', () => {
  it('文字間の空白を消し、行は空白なしでつなぐ', () => {
    const raw = '坂 の 上 の 図 書 館 は 、\n月 曜 日 だ け 休 み に な る 。\n'
    expect(cleanOcrText(raw).text).toBe('坂の上の図書館は、月曜日だけ休みになる。')
  })
})

describe('shouldTryEnglish', () => {
  it('日本語の学習データで読んだ結果が欧文主体なら、英語でも読み直す', () => {
    expect(shouldTryEnglish('The results show a clear improvement in reading speed.')).toBe(true)
    expect(shouldTryEnglish('坂の上の図書館は、月曜日だけ休みになる。')).toBe(false)
    expect(shouldTryEnglish('')).toBe(false)
  })
})
