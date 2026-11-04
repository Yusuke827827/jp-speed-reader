// 「メモ」のタブ。全部の本の栞・マーカー・メモを本ごとに並べ、探して、その文へ飛ぶ。

import { useEffect, useMemo, useState } from 'react'
import { getKV, listBooks, type BookMeta } from '../lib/db'
import { t } from '../lib/i18n'
import type { Note } from '../lib/notes'
import { go, Icon } from './common'

type Filter = 'all' | 'mark' | 'bookmark' | 'memo'

export function AllNotes() {
  const [groups, setGroups] = useState<{ book: BookMeta; notes: Note[] }[] | null>(null)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('all')

  useEffect(() => {
    ;(async () => {
      const books = await listBooks()
      const out: { book: BookMeta; notes: Note[] }[] = []
      for (const book of books) {
        const notes = (await getKV<Note[]>(`notes:${book.id}`)) ?? []
        if (notes.length) out.push({ book, notes: [...notes].sort((a, b) => a.n - b.n) })
      }
      // 最近印を付けた本を上に
      out.sort((a, b) => Math.max(...b.notes.map((n) => n.createdAt)) - Math.max(...a.notes.map((n) => n.createdAt)))
      setGroups(out)
    })().catch(() => setGroups([]))
  }, [])

  const shown = useMemo(() => {
    const word = q.trim()
    return (groups ?? [])
      .map((g) => ({
        book: g.book,
        notes: g.notes.filter((n) => {
          if (filter === 'mark' && !n.color) return false
          if (filter === 'bookmark' && n.color) return false
          if (filter === 'memo' && !n.memo) return false
          return !word || n.snippet.includes(word) || n.memo.includes(word) || g.book.title.includes(word)
        }),
      }))
      .filter((g) => g.notes.length)
  }, [groups, q, filter])

  const total = groups?.reduce((n, g) => n + g.notes.length, 0) ?? 0

  return (
    <div className="screen with-tabs" role="main">
      <header className="topbar" role="none">
        <h1>{t('メモ')}</h1>
      </header>

      {total > 0 && (
        <>
          <input type="search" className="search" placeholder={t('メモ・抜き書き・題名で探す')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('メモを探す')} />
          <div className="segmented" role="group" style={{ marginTop: 10 }}>
            {(
              [
                ['all', t('すべて')],
                ['mark', t('マーカー')],
                ['bookmark', t('栞')],
                ['memo', t('メモあり')],
              ] as const
            ).map(([v, l]) => (
              <button key={v} aria-pressed={filter === v} onClick={() => setFilter(v)}>
                {l}
              </button>
            ))}
          </div>
        </>
      )}

      {groups === null ? (
        <p className="muted">{t('読み込み中…')}</p>
      ) : total === 0 ? (
        <div className="empty-state">
          <p className="empty-title">{t('まだ印はありません')}</p>
          <p className="muted">{t('読書画面の栞のボタンで、気になった文にマーカーを引いたり、栞を挟んだりできます。ここに全部の本の印が集まります。')}</p>
        </div>
      ) : shown.length === 0 ? (
        <p className="section-foot">{t('見つかりませんでした。')}</p>
      ) : (
        shown.map((g) => (
          <section key={g.book.id}>
            <div className="section-title">
              {g.book.title}
              <span className="count">{g.notes.length}</span>
            </div>
            <ul className="list group">
              {g.notes.map((n) => (
                <li key={n.id}>
                  <button onClick={() => go(`/read/${g.book.id}?para=${n.para}&offset=${n.start}`)}>
                    <span className={`note-no${n.color ? ` mark-${n.color}` : ' bookmark'}`}>{n.n}</span>
                    <span className="grow">
                      <span className="note-snippet">{n.snippet}</span>
                      {n.memo && <span className="note-memo">{n.memo}</span>}
                    </span>
                    <Icon name="chevron" className="icon chevron" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  )
}
