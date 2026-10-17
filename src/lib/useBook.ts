import { useEffect, useState } from 'react'
import { buildBookText, type BookText } from './book'
import { getBook, getPages, getProgress, type BookMeta, type Progress } from './db'
import { t } from './i18n'

export interface LoadedBook {
  meta: BookMeta
  text: BookText
  progress?: Progress
}

export function useBook(id: string | undefined) {
  const [state, setState] = useState<{ book?: LoadedBook; error?: string; loading: boolean }>({ loading: true })
  const [reload, setReload] = useState(0)
  useEffect(() => {
    if (!id) return
    let alive = true
    ;(async () => {
      try {
        const meta = await getBook(id)
        if (!meta) throw new Error(t('この本は見つかりませんでした。本棚から削除された可能性があります。'))
        const pages = await getPages(id)
        const text = buildBookText(pages, meta.pageCount)
        const progress = await getProgress(id)
        if (alive) setState({ book: { meta, text, progress }, loading: false })
      } catch (e) {
        if (alive) setState({ error: (e as Error).message, loading: false })
      }
    })()
    return () => {
      alive = false
    }
  }, [id, reload])
  return { ...state, reload: () => setReload((n) => n + 1) }
}
