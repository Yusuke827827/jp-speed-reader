// 本のデータの書き出し・読み込み。機種変更や PC との間で、本棚と読書位置を移すために使う。
//
// 書き出しは 1 つの ZIP にまとめる。
//   manifest.json … このアプリの書き出しであることと、書き出しの種類（full／light）
//   data.json     … 本の情報・読書位置・履歴・しおり・メモ・設定
//   pages/<id>.json, files/<id> … full のときだけ。取り出した本文と、元の PDF・EPUB・テキスト
// full は「本ごと全部」、light は「位置・メモ・設定だけ」（本そのものは読み込む側の端末にある前提）。
//
// 読み込みは今の端末のデータに足し合わせる（消さない）。
// light では、読み込む側の端末にある同じ本を、ID → ファイル名と大きさ → 題名 の順で探して結びつける。
// 別に取り込んだ本は段落の番号がずれることがあるので、読書位置は読んだ割合から引き直させる。

import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { MOVED_TEXT_VERSION } from './book'
import { db, type BookMeta, type Bookmark, type PageRecord, type Progress, type Session } from './db'

export type BackupMode = 'full' | 'light'

const APP = 'jp-speed-reader'
const FORMAT = 1

export interface BackupData {
  books: BookMeta[]
  progress: Progress[]
  sessions: Session[]
  bookmarks: Bookmark[]
  /** 設定・メモ・壁紙など（kv の中身そのまま） */
  kv: Record<string, unknown>
  /** full のとき、元のファイルの種類 */
  files: { id: string; type: string }[]
}

export interface Backup {
  mode: BackupMode
  exportedAt: number
  data: BackupData
  pages: Map<string, PageRecord[]>
  files: Map<string, Uint8Array>
}

export class BackupError extends Error {}

// ---------- 書き出し ----------

/** データを ZIP にする。元のファイルは圧縮しても小さくならないので、そのまま入れる */
export function packBackup(b: Backup): Uint8Array {
  const entries: Record<string, Uint8Array | [Uint8Array, { level: 0 }]> = {
    'manifest.json': strToU8(JSON.stringify({ app: APP, format: FORMAT, mode: b.mode, exportedAt: b.exportedAt, books: b.data.books.length })),
    'data.json': strToU8(JSON.stringify(b.data)),
  }
  if (b.mode === 'full') {
    for (const [id, pages] of b.pages) entries[`pages/${id}.json`] = strToU8(JSON.stringify(pages))
    for (const [id, data] of b.files) entries[`files/${id}`] = [data, { level: 0 }]
  }
  return zipSync(entries)
}

/** 今の端末のデータを集める */
export async function collectBackup(mode: BackupMode): Promise<Backup> {
  const d = await db()
  const [books, progress, sessions, bookmarks, keys] = await Promise.all([d.getAll('books'), d.getAll('progress'), d.getAll('sessions'), d.getAll('bookmarks'), d.getAllKeys('kv')])
  const kv: Record<string, unknown> = {}
  for (const k of keys) {
    // 壁紙の写真は大きいので、本ごと書き出すときだけ入れる
    if (k === 'wallpaper' && mode === 'light') continue
    kv[k] = await d.get('kv', k)
  }
  const pages = new Map<string, PageRecord[]>()
  const files = new Map<string, Uint8Array>()
  const fileTypes: { id: string; type: string }[] = []
  if (mode === 'full') {
    for (const b of books) {
      pages.set(b.id, await d.getAllFromIndex('pages', 'byBook', b.id))
      const rec = await d.get('files', b.id)
      const data = rec?.data ?? (rec?.blob ? await rec.blob.arrayBuffer() : undefined)
      if (data) {
        files.set(b.id, new Uint8Array(data))
        fileTypes.push({ id: b.id, type: rec?.type ?? rec?.blob?.type ?? 'application/pdf' })
      }
    }
  }
  return {
    mode,
    exportedAt: Date.now(),
    data: { books, progress, sessions: sessions.map(({ id: _id, ...s }) => s), bookmarks: bookmarks.map(({ id: _id, ...b }) => b), kv, files: fileTypes },
    pages,
    files,
  }
}

export function backupFileName(mode: BackupMode, now = new Date()): string {
  const d = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  return `jp-speed-reader-${mode === 'full' ? 'all' : 'progress'}-${d}.zip`
}

// ---------- 読み込み ----------

export function unpackBackup(buf: ArrayBuffer): Backup {
  let z: Record<string, Uint8Array>
  try {
    z = unzipSync(new Uint8Array(buf))
  } catch {
    throw new BackupError('not a zip')
  }
  let manifest: { app?: string; format?: number; mode?: BackupMode; exportedAt?: number }
  let data: BackupData
  try {
    manifest = JSON.parse(strFromU8(z['manifest.json']))
    data = JSON.parse(strFromU8(z['data.json']))
  } catch {
    throw new BackupError('broken')
  }
  if (manifest.app !== APP || !manifest.mode || !Array.isArray(data?.books)) throw new BackupError('not ours')
  if ((manifest.format ?? 0) > FORMAT) throw new BackupError('newer')
  const pages = new Map<string, PageRecord[]>()
  const files = new Map<string, Uint8Array>()
  for (const b of data.books) {
    const p = z[`pages/${b.id}.json`]
    if (p) pages.set(b.id, JSON.parse(strFromU8(p)))
    const f = z[`files/${b.id}`]
    if (f) files.set(b.id, f)
  }
  // 古い書き出しや手で直したファイルで欠けている項目は、空として扱う
  const full: BackupData = {
    books: data.books,
    progress: data.progress ?? [],
    sessions: data.sessions ?? [],
    bookmarks: data.bookmarks ?? [],
    kv: data.kv ?? {},
    files: data.files ?? [],
  }
  return { mode: manifest.mode, exportedAt: manifest.exportedAt ?? 0, data: full, pages, files }
}

export type BookAction =
  /** 本ごと足す（full） */
  | { kind: 'add'; book: BookMeta }
  /** この端末にある本に、位置・メモを結びつける */
  | { kind: 'match'; book: BookMeta; localId: string; sameId: boolean }
  /** この端末に無い（light） */
  | { kind: 'missing'; book: BookMeta }

/** 書き出しの本ごとに、どう読み込むかを決める */
export function planRestore(b: Backup, local: BookMeta[]): BookAction[] {
  const used = new Set<string>()
  return b.data.books.map((book): BookAction => {
    const byId = local.find((l) => l.id === book.id)
    if (byId) {
      used.add(byId.id)
      return { kind: 'match', book, localId: byId.id, sameId: true }
    }
    if (b.mode === 'full' && b.pages.has(book.id)) return { kind: 'add', book }
    const same = local.find((l) => !used.has(l.id) && l.fileName === book.fileName && l.fileSize === book.fileSize) ?? local.find((l) => !used.has(l.id) && l.title === book.title)
    if (same) {
      used.add(same.id)
      return { kind: 'match', book, localId: same.id, sameId: false }
    }
    return { kind: 'missing', book }
  })
}

export interface RestoreResult {
  added: number
  matched: number
  missing: string[]
}

interface NoteLike {
  id: string
  n: number
}

/** 番号の重なる印は、後ろに番号を振り直して足す */
export function mergeNotes<T extends NoteLike>(local: T[], incoming: T[]): T[] {
  const out = [...local]
  const ids = new Set(local.map((n) => n.id))
  let next = local.reduce((m, n) => Math.max(m, n.n), 0) + 1
  const usedN = new Set(local.map((n) => n.n))
  for (const n of incoming) {
    if (ids.has(n.id)) continue
    out.push(usedN.has(n.n) ? { ...n, n: next++ } : n)
    usedN.add(n.n)
    next = Math.max(next, n.n + 1)
  }
  return out
}

/** 読み込む。今の端末のデータは消さずに足し合わせる */
export async function applyRestore(b: Backup, plan: BookAction[], opts: { settings: boolean }): Promise<RestoreResult> {
  const d = await db()
  const idMap = new Map<string, { id: string; sameId: boolean }>()
  const result: RestoreResult = { added: 0, matched: 0, missing: [] }

  for (const a of plan) {
    if (a.kind === 'missing') {
      result.missing.push(a.book.title)
      continue
    }
    if (a.kind === 'add') {
      const type = b.data.files.find((f) => f.id === a.book.id)?.type ?? 'application/pdf'
      const file = b.files.get(a.book.id)
      const tx = d.transaction(['books', 'pages', 'files'], 'readwrite')
      await tx.objectStore('books').put(a.book)
      for (const p of b.pages.get(a.book.id) ?? []) await tx.objectStore('pages').put(p)
      if (file) await tx.objectStore('files').put({ id: a.book.id, data: file.slice().buffer as ArrayBuffer, type })
      await tx.done
      idMap.set(a.book.id, { id: a.book.id, sameId: true })
      result.added++
    } else {
      idMap.set(a.book.id, { id: a.localId, sameId: a.sameId })
      result.matched++
    }
  }

  // 読書位置: 新しい方を残す。ただし、この端末で開いただけでまだ読んでいない本（読書時間 1 秒未満）は書き出しの方を使う。
  // 別に取り込んだ本の位置は、読んだ割合から引き直させる
  for (const p of b.data.progress) {
    const to = idMap.get(p.bookId)
    if (!to) continue
    const cur = await d.get('progress', to.id)
    if (cur && cur.lastReadAt >= p.lastReadAt && cur.readingMs >= 1000) continue
    await d.put('progress', { ...p, bookId: to.id, textVersion: to.sameId ? p.textVersion : MOVED_TEXT_VERSION, readingMs: Math.max(p.readingMs, cur?.readingMs ?? 0) })
  }

  // 履歴・しおり: 同じものは足さない
  const sessions = await d.getAll('sessions')
  const seen = new Set(sessions.map((s) => `${s.bookId}|${s.start}`))
  for (const s of b.data.sessions) {
    const to = idMap.get(s.bookId)?.id ?? s.bookId
    if (seen.has(`${to}|${s.start}`)) continue
    seen.add(`${to}|${s.start}`)
    await d.add('sessions', { ...s, bookId: to })
  }
  const marks = await d.getAll('bookmarks')
  const seenMarks = new Set(marks.map((m) => `${m.bookId}|${m.page}|${m.label}`))
  for (const m of b.data.bookmarks) {
    const to = idMap.get(m.bookId)
    if (!to || seenMarks.has(`${to.id}|${m.page}|${m.label}`)) continue
    seenMarks.add(`${to.id}|${m.page}|${m.label}`)
    await d.add('bookmarks', { ...m, bookId: to.id })
  }

  // メモ・設定・壁紙
  for (const [k, v] of Object.entries(b.data.kv)) {
    if (k.startsWith('notes:')) {
      const to = idMap.get(k.slice(6))
      if (!to || !Array.isArray(v)) continue
      const local = ((await d.get('kv', `notes:${to.id}`)) as NoteLike[] | undefined) ?? []
      await d.put('kv', mergeNotes(local, v as NoteLike[]), `notes:${to.id}`)
    } else if (opts.settings && (k === 'settings' || k === 'wallpaper')) {
      await d.put('kv', v, k)
    }
  }
  return result
}
