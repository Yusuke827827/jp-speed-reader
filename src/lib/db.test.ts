import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import {
  addBookmark,
  addSession,
  deleteBook,
  getBook,
  getPages,
  getProgress,
  listBookmarks,
  listSessions,
  putBook,
  putPages,
  saveProgress,
  type BookMeta,
} from './db'

const meta = (id: string): BookMeta => ({
  id,
  title: 'テスト',
  fileName: 't.pdf',
  fileSize: 1,
  fileModified: 0,
  pageCount: 2,
  createdAt: 0,
  vertical: false,
  emptyPages: 0,
  ocr: { status: 'none', done: 0, target: 0 },
  textVersion: 1,
})

describe('db', () => {
  it('読書位置を保存し、読み直せる', async () => {
    await putBook(meta('a'))
    await saveProgress({ bookId: 'a', para: 3, offset: 12, page: 1, percent: 42.5, readingMs: 60000, lastReadAt: 1, textVersion: 1 })
    expect(await getProgress('a')).toMatchObject({ para: 3, offset: 12, page: 1, percent: 42.5 })
  })

  it('3 秒未満の再生は履歴に残さない', async () => {
    const base = { bookId: 'a', title: 'テスト', start: 0, end: 0, chars: 10, fromPercent: 0, toPercent: 1, cpm: 600 }
    await addSession({ ...base, ms: 1000 })
    await addSession({ ...base, ms: 5000, start: 10 })
    const xs = (await listSessions()).filter((s) => s.bookId === 'a')
    expect(xs.map((s) => s.ms)).toEqual([5000])
  })

  it('本を削除すると、ページ・位置・履歴・しおりも消え、他の本は残る', async () => {
    await putBook(meta('b'))
    await putBook(meta('c'))
    await putPages([
      { bookId: 'b', pageIndex: 0, text: 'x', contFromPrev: false, vertical: false, source: 'text' },
      { bookId: 'c', pageIndex: 0, text: 'y', contFromPrev: false, vertical: false, source: 'text' },
    ])
    await saveProgress({ bookId: 'b', para: 0, offset: 0, page: 0, percent: 0, readingMs: 0, lastReadAt: 0, textVersion: 1 })
    await addBookmark({ bookId: 'b', page: 0, label: 'p1', createdAt: 0 })
    await addSession({ bookId: 'b', title: 'b', start: 1, end: 2, ms: 9000, chars: 50, fromPercent: 0, toPercent: 5, cpm: 333 })

    await deleteBook('b')

    expect(await getBook('b')).toBeUndefined()
    expect(await getPages('b')).toEqual([])
    expect(await getProgress('b')).toBeUndefined()
    expect(await listBookmarks('b')).toEqual([])
    expect((await listSessions()).some((s) => s.bookId === 'b')).toBe(false)
    expect((await getPages('c')).length).toBe(1)
  })
})
