// 栞・蛍光マーカー・メモのシート。上で今の文に印を付け、下の番号付きの一覧から文へ飛ぶ。

import { useState } from 'react'
import type { BookText, TextPosition } from '../lib/book'
import { pageAt } from '../lib/book'
import { t } from '../lib/i18n'
import { MARK_COLORS, nextNumber, sentenceAt, type MarkColor, type Note } from '../lib/notes'
import { newId } from '../lib/importer'
import { Icon, toast } from './common'

const colorLabel = (c: MarkColor) => ({ yellow: t('黄'), green: t('緑'), blue: t('青'), pink: t('桃') })[c]

export function NotesSheet(props: {
  book: BookText
  pos: TextPosition
  notes: Note[]
  onChange: (notes: Note[]) => void
  onJump: (pos: TextPosition) => void
  onClose: () => void
}) {
  const { book, pos, notes, onChange } = props
  const para = book.paragraphs[pos.para]
  const [start, end] = para ? sentenceAt(para.text, pos.offset) : [0, 0]
  const sentence = para ? para.text.slice(start, end) : ''
  const existing = notes.find((n) => n.para === pos.para && n.start === start && n.end === end)
  const [color, setColor] = useState<MarkColor | undefined>(existing?.color ?? 'yellow')
  const [memo, setMemo] = useState(existing?.memo ?? '')
  const [jumpTo, setJumpTo] = useState('')

  const save = (asBookmark: boolean) => {
    if (!para || !sentence) return
    const note: Note = {
      id: existing?.id ?? newId(),
      n: existing?.n ?? nextNumber(notes),
      para: pos.para,
      start,
      end,
      color: asBookmark ? undefined : color,
      memo: memo.trim(),
      snippet: sentence,
      page: pageAt(book, { para: pos.para, offset: start }),
      createdAt: existing?.createdAt ?? Date.now(),
    }
    onChange(existing ? notes.map((n) => (n.id === note.id ? note : n)) : [...notes, note])
    toast(asBookmark ? t('{n}番の栞を挟みました', { n: note.n }) : t('{n}番の印を付けました', { n: note.n }))
  }

  const jump = (n: Note) => {
    props.onJump({ para: n.para, offset: n.start })
    props.onClose()
  }

  const sorted = [...notes].sort((a, b) => a.n - b.n)

  return (
    <>
      <div className="sheet-backdrop" onClick={props.onClose} />
      <div className="sheet stack" role="dialog" aria-label={t('栞・マーカー・メモ')}>
        <div className="row">
          <div className="grow" style={{ fontWeight: 700, fontSize: 17 }}>
            {t('栞・マーカー・メモ')}
          </div>
          <button className="icon-btn" aria-label={t('閉じる')} onClick={props.onClose}>
            <Icon name="close" />
          </button>
        </div>

        <div className="card stack" style={{ padding: 12 }}>
          <div className="small muted">{existing ? t('今の文（{n}番の印が付いています）', { n: existing.n }) : t('今の文')}</div>
          <div className={`note-sentence${color ? ` mark-${color}` : ''}`}>{sentence}</div>
          <div className="row wrap" role="group" aria-label={t('マーカーの色')}>
            {MARK_COLORS.map((c) => (
              <button key={c} className={`swatch mark-swatch mark-${c}`} aria-pressed={color === c} aria-label={colorLabel(c)} onClick={() => setColor(c)} />
            ))}
          </div>
          <textarea value={memo} onChange={(e) => setMemo(e.target.value)} placeholder={t('メモ（なくてもかまいません）')} aria-label={t('メモ')} rows={2} style={{ minHeight: 0 }} />
          <div className="row wrap">
            <button className="btn small primary" onClick={() => save(false)} disabled={!sentence}>
              {existing ? t('印を更新') : t('マーカーを引く')}
            </button>
            <button className="btn small" onClick={() => save(true)} disabled={!sentence}>
              <Icon name="bookmark" /> {t('栞だけ挟む')}
            </button>
            {existing && (
              <button className="btn small danger" onClick={() => onChange(notes.filter((n) => n.id !== existing.id))}>
                {t('この印を消す')}
              </button>
            )}
          </div>
        </div>

        <div className="row">
          <span className="small muted">{t('番号で移動')}</span>
          <input type="number" inputMode="numeric" min={1} value={jumpTo} onChange={(e) => setJumpTo(e.target.value)} style={{ maxWidth: 100 }} aria-label={t('印の番号')} />
          <button
            className="btn small"
            onClick={() => {
              const n = notes.find((x) => x.n === Number(jumpTo))
              if (n) jump(n)
              else toast(t('その番号の印はありません'))
            }}
          >
            {t('移動')}
          </button>
        </div>

        {sorted.length === 0 ? (
          <p className="small muted">{t('まだ印はありません。気になった文で、マーカーを引くか栞を挟んでください。')}</p>
        ) : (
          <ul className="list">
            {sorted.map((n) => (
              <li key={n.id}>
                <button onClick={() => jump(n)}>
                  <span className={`note-no${n.color ? ` mark-${n.color}` : ' bookmark'}`}>{n.n}</span>
                  <span className="grow">
                    <span className="note-snippet">{n.snippet}</span>
                    {n.memo && <span className="note-memo">{n.memo}</span>}
                  </span>
                  <span className="small muted" style={{ whiteSpace: 'nowrap' }}>
                    p.{n.page + 1}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  )
}
