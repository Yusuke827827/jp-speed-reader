// ホーム画面から開いたとき、本棚を飛ばして前回の本の続きをすぐ開く（iPhone のウィジェットの代わり）。
// ブラウザのタブで開いたときは、驚かせないよう本棚のままにする。

import { getBook, listProgress } from './db'

/** 起動した画面が本棚で、ホーム画面から開いていて、設定がオンのときだけ続きを開く */
export function shouldResume(hash: string, standalone: boolean, enabled: boolean): boolean {
  return enabled && standalone && (hash === '' || hash === '#' || hash === '#/')
}

export function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean }
  return window.matchMedia?.('(display-mode: standalone)').matches === true || nav.standalone === true
}

/** 最後に読んだ本（本棚から消した本は除く） */
export async function lastReadBookId(): Promise<string | null> {
  const ps = (await listProgress()).sort((a, b) => b.lastReadAt - a.lastReadAt)
  for (const p of ps) if (await getBook(p.bookId)) return p.bookId
  return null
}
