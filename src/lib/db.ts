// 端末内（IndexedDB）への保存。本文・読書位置・履歴を外部へ送ることはない。

import { openDB, type DBSchema, type IDBPDatabase } from 'idb'

export type PageSource = 'text' | 'ocr' | 'edited' | 'empty'
export type OcrStatus = 'none' | 'needed' | 'running' | 'paused' | 'done' | 'error'
export type OcrLang = 'jpn' | 'jpn_vert'

export interface TocEntry {
  title: string
  page: number
  depth: number
}

/** 本ごとに登録する人物。名前（と別名）を本文中で色分けし、説明を添える */
export interface Person {
  id: string
  name: string
  aliases: string[]
  color: string
  label: string
}

export interface BookMeta {
  id: string
  /** 取り込んだファイルの種類（古いデータには無いので、無ければ PDF） */
  kind?: 'pdf' | 'text'
  title: string
  author?: string
  /** 目次。PDF のしおり、またはテキストの見出しから作る */
  toc?: TocEntry[]
  people?: Person[]
  fileName: string
  fileSize: number
  fileModified: number
  pageCount: number
  createdAt: number
  cover?: string // 表紙の小さな JPEG（data URL）
  vertical: boolean
  /** テキストを取り出せなかったページ数 */
  emptyPages: number
  ocr: {
    status: OcrStatus
    lang?: OcrLang
    done: number
    target: number
    error?: string
    updatedAt?: number
  }
  /** 本文の版。本文を直すたびに増やし、読書位置のずれ検出に使う */
  textVersion: number
}

export interface PageRecord {
  bookId: string
  pageIndex: number
  text: string
  contFromPrev: boolean
  vertical: boolean
  source: PageSource
  confidence?: number
  /** 挿絵のページ（本文がある場合は挿絵入りのページ）か、白紙か */
  image?: 'illust' | 'blank'
  /** 挿絵の範囲（ページに対する割合）。無ければページ全体 */
  illustRect?: [number, number, number, number]
}

/** OCR をかけるべきページ（文字が取れず、挿絵・白紙でもない） */
export function needsOcr(p: PageRecord): boolean {
  return p.source === 'empty' && !p.image
}

export interface Progress {
  bookId: string
  para: number
  offset: number
  page: number
  percent: number
  readingMs: number
  lastReadAt: number
  textVersion: number
}

export interface Session {
  id?: number
  bookId: string
  title: string
  start: number
  end: number
  ms: number
  chars: number
  fromPercent: number
  toPercent: number
  cpm: number
}

export interface Bookmark {
  id?: number
  bookId: string
  page: number
  label: string
  createdAt: number
}

interface Schema extends DBSchema {
  books: { key: string; value: BookMeta }
  files: { key: string; value: { id: string; blob: Blob } }
  pages: { key: [string, number]; value: PageRecord; indexes: { byBook: string } }
  progress: { key: string; value: Progress }
  sessions: { key: number; value: Session; indexes: { byBook: string; byStart: number } }
  bookmarks: { key: number; value: Bookmark; indexes: { byBook: string } }
  kv: { key: string; value: unknown }
}

let dbp: Promise<IDBPDatabase<Schema>> | null = null

export function db() {
  dbp ??= openDB<Schema>('jp-speed-reader', 1, {
    upgrade(d) {
      d.createObjectStore('books', { keyPath: 'id' })
      d.createObjectStore('files', { keyPath: 'id' })
      const pages = d.createObjectStore('pages', { keyPath: ['bookId', 'pageIndex'] })
      pages.createIndex('byBook', 'bookId')
      d.createObjectStore('progress', { keyPath: 'bookId' })
      const s = d.createObjectStore('sessions', { keyPath: 'id', autoIncrement: true })
      s.createIndex('byBook', 'bookId')
      s.createIndex('byStart', 'start')
      const b = d.createObjectStore('bookmarks', { keyPath: 'id', autoIncrement: true })
      b.createIndex('byBook', 'bookId')
      d.createObjectStore('kv')
    },
    blocked() {
      console.warn('別のタブが古いデータベースを開いています')
    },
  })
  return dbp
}

/** 容量不足などの保存エラーを、利用者向けの文に直す */
export function describeStorageError(e: unknown): string {
  const name = (e as { name?: string })?.name
  if (name === 'QuotaExceededError') {
    return '端末の保存容量が足りません。読み終えた本を本棚から削除するか、ストレージの空きを増やしてから、もう一度試してください。'
  }
  if (name === 'InvalidStateError' || name === 'UnknownError') {
    return 'ブラウザの保存領域にアクセスできませんでした。プライベートブラウズを使っている場合は通常モードで開いてください。'
  }
  return `保存に失敗しました（${name ?? '不明なエラー'}）。ページを再読み込みしてから、もう一度試してください。`
}

export async function listBooks(): Promise<BookMeta[]> {
  return (await db()).getAll('books')
}

export async function getBook(id: string) {
  return (await db()).get('books', id)
}

export async function putBook(b: BookMeta) {
  await (await db()).put('books', b)
}

export async function updateBook(id: string, patch: (b: BookMeta) => void) {
  const d = await db()
  const tx = d.transaction('books', 'readwrite')
  const b = await tx.store.get(id)
  if (b) {
    patch(b)
    await tx.store.put(b)
  }
  await tx.done
  return b
}

export async function saveFile(id: string, blob: Blob) {
  await (await db()).put('files', { id, blob })
}

export async function getFile(id: string) {
  return (await (await db()).get('files', id))?.blob
}

export async function putPages(pages: PageRecord[]) {
  const d = await db()
  const tx = d.transaction('pages', 'readwrite')
  await Promise.all([...pages.map((p) => tx.store.put(p)), tx.done])
}

export async function getPages(bookId: string): Promise<PageRecord[]> {
  const ps = await (await db()).getAllFromIndex('pages', 'byBook', bookId)
  return ps.sort((a, b) => a.pageIndex - b.pageIndex)
}

export async function getPage(bookId: string, pageIndex: number) {
  return (await db()).get('pages', [bookId, pageIndex])
}

export async function getProgress(bookId: string) {
  return (await db()).get('progress', bookId)
}

export async function listProgress(): Promise<Progress[]> {
  return (await db()).getAll('progress')
}

export async function saveProgress(p: Progress) {
  await (await db()).put('progress', p)
}

export async function addSession(s: Session) {
  if (s.ms < 3000 || s.chars === 0) return // 数秒で止めただけの記録は残さない
  await (await db()).add('sessions', s)
}

export async function listSessions(): Promise<Session[]> {
  const xs = await (await db()).getAllFromIndex('sessions', 'byStart')
  return xs.reverse()
}

export async function listBookmarks(bookId: string) {
  const xs = await (await db()).getAllFromIndex('bookmarks', 'byBook', bookId)
  return xs.sort((a, b) => a.page - b.page)
}

export async function addBookmark(b: Bookmark) {
  return (await db()).add('bookmarks', b)
}

export async function deleteBookmark(id: number) {
  await (await db()).delete('bookmarks', id)
}

export async function deleteBook(id: string) {
  const d = await db()
  const tx = d.transaction(['books', 'files', 'pages', 'progress', 'sessions', 'bookmarks'], 'readwrite')
  await tx.objectStore('books').delete(id)
  await tx.objectStore('files').delete(id)
  await tx.objectStore('progress').delete(id)
  for (const store of ['pages', 'sessions', 'bookmarks'] as const) {
    const idx = tx.objectStore(store).index('byBook')
    let cur = await idx.openCursor(id)
    while (cur) {
      await cur.delete()
      cur = await cur.continue()
    }
  }
  await tx.done
}

export async function getKV<T>(key: string): Promise<T | undefined> {
  return (await (await db()).get('kv', key)) as T | undefined
}

export async function setKV(key: string, value: unknown) {
  await (await db()).put('kv', value, key)
}

export async function storageInfo() {
  const est = (await navigator.storage?.estimate?.()) ?? {}
  const persisted = (await navigator.storage?.persisted?.()) ?? false
  return { usage: est.usage ?? 0, quota: est.quota ?? 0, persisted }
}

export async function requestPersist() {
  return (await navigator.storage?.persist?.()) ?? false
}
