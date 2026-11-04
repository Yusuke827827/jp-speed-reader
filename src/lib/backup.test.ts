import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { buildBookText, positionForPercent, percentAt } from './book'
import { applyRestore, backupFileName, BackupError, collectBackup, mergeNotes, packBackup, planRestore, unpackBackup } from './backup'
import { addSession, db, deleteBook, getFile, getPages, getProgress, listSessions, putBook, putPages, saveFile, saveProgress, setKV, type BookMeta } from './db'

const meta = (id: string, over: Partial<BookMeta> = {}): BookMeta => ({
  id,
  title: `本${id}`,
  fileName: `${id}.pdf`,
  fileSize: 100,
  fileModified: 0,
  pageCount: 1,
  createdAt: 0,
  vertical: false,
  emptyPages: 0,
  ocr: { status: 'none', done: 0, target: 0 },
  textVersion: 1,
  ...over,
})

const toBuf = (u: Uint8Array) => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer
const note = (id: string, n: number) => ({ id, n, para: 0, start: 0, end: 3, memo: '', snippet: 'あいう', page: 0, createdAt: 0 })

async function seed() {
  await putBook(meta('x'))
  await putPages([{ bookId: 'x', pageIndex: 0, text: '本文の一行目。', contFromPrev: false, vertical: false, source: 'text' }])
  await saveFile('x', new Blob([new Uint8Array([1, 2, 3])], { type: 'application/pdf' }))
  await saveProgress({ bookId: 'x', para: 0, offset: 2, page: 0, percent: 30, readingMs: 5000, lastReadAt: 1000, textVersion: 1 })
  await addSession({ bookId: 'x', title: '本x', start: 10, end: 20000, ms: 19990, chars: 100, fromPercent: 0, toPercent: 30, cpm: 300 })
  await setKV('notes:x', [note('n1', 1)])
  await setKV('settings', { cpm: 777 })
}

describe('書き出し・読み込み', () => {
  it('本ごと書き出したものを読み込むと、消した本が元に戻る', async () => {
    await seed()
    const zip = packBackup(await collectBackup('full'))
    await deleteBook('x')
    const b = unpackBackup(toBuf(zip))
    expect(b.mode).toBe('full')
    const plan = planRestore(b, [])
    expect(plan.map((p) => p.kind)).toEqual(['add'])
    const r = await applyRestore(b, plan, { settings: true })
    expect(r.added).toBe(1)
    expect((await getPages('x'))[0].text).toBe('本文の一行目。')
    expect(new Uint8Array(await (await getFile('x'))!.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]))
    expect((await getProgress('x'))!.percent).toBe(30)
  })

  it('同じものを 2 回読み込んでも、履歴とメモは増えない', async () => {
    const b = unpackBackup(toBuf(packBackup(await collectBackup('full'))))
    const before = (await listSessions()).length
    await applyRestore(b, planRestore(b, [meta('x')]), { settings: false })
    await applyRestore(b, planRestore(b, [meta('x')]), { settings: false })
    expect((await listSessions()).length).toBe(before)
    expect(((await (await db()).get('kv', 'notes:x')) as unknown[]).length).toBe(1)
  })

  it('位置だけの書き出しは、本そのものを含まない', async () => {
    const b = await collectBackup('light')
    expect(b.files.size).toBe(0)
    const back = unpackBackup(toBuf(packBackup(b)))
    expect(back.pages.size).toBe(0)
    expect(back.data.books).toHaveLength(1)
  })

  it('位置だけの読み込みでは、別の端末で取り込んだ同じ本（ファイル名と大きさが同じ）に結びつけ、位置は読んだ割合から引き直させる', async () => {
    const b = unpackBackup(toBuf(packBackup(await collectBackup('light'))))
    await putBook(meta('y', { fileName: 'x.pdf', fileSize: 100, title: '別の題' }))
    const plan = planRestore(b, [meta('y', { fileName: 'x.pdf', fileSize: 100, title: '別の題' })])
    expect(plan[0]).toMatchObject({ kind: 'match', localId: 'y', sameId: false })
    await applyRestore(b, plan, { settings: false })
    const p = await getProgress('y')
    expect(p).toMatchObject({ percent: 30, textVersion: -1 })
    expect((await listSessions()).some((s) => s.bookId === 'y')).toBe(true)
  })

  it('この端末で開いただけの本は、後から開いていても、書き出した側の位置を使う', async () => {
    const b = unpackBackup(toBuf(packBackup(await collectBackup('light'))))
    await putBook(meta('z', { fileName: 'x.pdf', fileSize: 100 }))
    await saveProgress({ bookId: 'z', para: 0, offset: 0, page: 0, percent: 0, readingMs: 0, lastReadAt: Date.now(), textVersion: 1 })
    const plan = planRestore(b, [meta('z', { fileName: 'x.pdf', fileSize: 100 })])
    await applyRestore(b, plan, { settings: false })
    expect((await getProgress('z'))!.percent).toBe(30)
  })

  it('この端末で読み進めた本は、新しい方の位置を残す', async () => {
    const b = unpackBackup(toBuf(packBackup(await collectBackup('light'))))
    await saveProgress({ bookId: 'x', para: 0, offset: 0, page: 0, percent: 80, readingMs: 60000, lastReadAt: Date.now(), textVersion: 1 })
    await applyRestore(b, planRestore(b, [meta('x')]), { settings: false })
    expect((await getProgress('x'))!.percent).toBe(80)
  })

  it('この端末に無い本は、名前を挙げて知らせる', async () => {
    const b = unpackBackup(toBuf(packBackup(await collectBackup('light'))))
    const plan = planRestore(b, [])
    const r = await applyRestore(b, plan, { settings: false })
    // 前のテストで足した本も書き出しに入るので、含まれることだけを確かめる
    expect(r.missing).toContain('本x')
    expect(r.matched).toBe(0)
  })

  it('設定は、選んだときだけ上書きする', async () => {
    const b = unpackBackup(toBuf(packBackup(await collectBackup('light'))))
    await setKV('settings', { cpm: 500 })
    await applyRestore(b, planRestore(b, [meta('x')]), { settings: false })
    expect(await (await db()).get('kv', 'settings')).toEqual({ cpm: 500 })
    await applyRestore(b, planRestore(b, [meta('x')]), { settings: true })
    expect(await (await db()).get('kv', 'settings')).toEqual({ cpm: 777 })
  })

  it('番号の重なる印は、番号を振り直して足す', () => {
    const out = mergeNotes([note('a', 1), note('b', 2)], [note('a', 1), note('c', 2), note('d', 5)])
    expect(out.map((n) => [n.id, n.n])).toEqual([
      ['a', 1],
      ['b', 2],
      ['c', 3],
      ['d', 5],
    ])
  })

  it('このアプリの書き出しでないファイルは断る', () => {
    expect(() => unpackBackup(new ArrayBuffer(8))).toThrow(BackupError)
  })

  it('ファイル名に日付と種類が入る', () => {
    expect(backupFileName('full', new Date(2026, 10, 4))).toBe('jp-speed-reader-all-2026-11-04.zip')
    expect(backupFileName('light', new Date(2026, 0, 9))).toBe('jp-speed-reader-progress-2026-01-09.zip')
  })

  it('読んだ割合から、ほぼ同じ位置に戻せる', () => {
    const book = buildBookText([{ pageIndex: 0, text: 'あいうえおかきくけこ\nさしすせそたちつてと', contFromPrev: false }], 1)
    const pos = positionForPercent(book, 75)
    expect(pos).toEqual({ para: 1, offset: 5 })
    expect(percentAt(book, pos)).toBe(75)
  })
})
