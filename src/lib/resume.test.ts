import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { putBook, saveProgress, type BookMeta } from './db'
import { lastReadBookId, shouldResume } from './resume'

const meta = (id: string): BookMeta => ({
  id,
  title: id,
  fileName: `${id}.pdf`,
  fileSize: 1,
  fileModified: 0,
  pageCount: 1,
  createdAt: 0,
  vertical: false,
  emptyPages: 0,
  ocr: { status: 'none', done: 0, target: 0 },
  textVersion: 1,
})

describe('ホーム画面から続きを開く', () => {
  it('ホーム画面から本棚を開いたときだけ、続きを開く', () => {
    expect(shouldResume('', true, true)).toBe(true)
    expect(shouldResume('#/', true, true)).toBe(true)
    expect(shouldResume('#/settings', true, true)).toBe(false)
    expect(shouldResume('', false, true)).toBe(false)
    expect(shouldResume('', true, false)).toBe(false)
  })
  it('最後に読んだ本を選び、本棚から消した本は飛ばす', async () => {
    await putBook(meta('a'))
    await saveProgress({ bookId: 'a', para: 0, offset: 0, page: 0, percent: 1, readingMs: 0, lastReadAt: 10, textVersion: 1 })
    await saveProgress({ bookId: 'gone', para: 0, offset: 0, page: 0, percent: 1, readingMs: 0, lastReadAt: 20, textVersion: 1 })
    expect(await lastReadBookId()).toBe('a')
  })
})
