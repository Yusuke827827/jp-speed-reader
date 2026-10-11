import { useEffect, useMemo, useRef, useState } from 'react'
import { addBookmark, deleteBookmark, getBook, getFile, getPages, listBookmarks, putPages, updateBook, type BookMeta, type Bookmark, type PageRecord } from '../lib/db'
import { closePdf, openPdf, readOutline, renderPage, renderToCanvas, type PDFDocumentProxy } from '../lib/pdf'
import { ErrorBox, go, Icon, toast } from './common'
import { parseRuby } from '../lib/normalize'

type Panel = null | 'thumbs' | 'toc' | 'search' | 'marks'

export function PdfViewer({ id, initialPage, compare: compareInit, fromReader }: { id: string; initialPage: number; compare: boolean; fromReader: boolean }) {
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null)
  const [meta, setMeta] = useState<BookMeta | null>(null)
  const [pages, setPages] = useState<PageRecord[]>([])
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(Math.max(0, initialPage))
  const [zoom, setZoom] = useState(1)
  const [panel, setPanel] = useState<Panel>(null)
  const [compare, setCompare] = useState(compareInit)
  const bodyRef = useRef<HTMLDivElement>(null)
  const [bodyW, setBodyW] = useState(360)

  useEffect(() => {
    let alive = true
    let d: PDFDocumentProxy | null = null
    ;(async () => {
      try {
        const m = await getBook(id)
        if (!m) throw new Error('この本は見つかりませんでした。')
        const blob = await getFile(id)
        if (!blob) throw new Error('元のPDFが保存されていません。本棚から取り込み直してください。')
        d = await openPdf(await blob.arrayBuffer())
        if (!alive) return closePdf(d)
        setMeta(m)
        setDoc(d)
        setPages(await getPages(id))
        setPage((p) => Math.min(p, d!.numPages - 1))
      } catch (e) {
        if (alive) setError((e as Error).message)
      }
    })()
    return () => {
      alive = false
      closePdf(d)
    }
  }, [id])

  useEffect(() => {
    const el = bodyRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setBodyW(el.clientWidth))
    ro.observe(el)
    setBodyW(el.clientWidth)
    return () => ro.disconnect()
  }, [doc])

  const n = doc?.numPages ?? meta?.pageCount ?? 1
  const back = () => (fromReader ? go(`/read/${id}`) : go('/'))
  const goPage = (p: number) => setPage(Math.max(0, Math.min(n - 1, p)))

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'ArrowRight' || e.key === 'PageDown') goPage(page + 1)
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') goPage(page - 1)
      else if (e.key === '+' || e.key === '=') setZoom((z) => Math.min(4, z * 1.25))
      else if (e.key === '-') setZoom((z) => Math.max(0.5, z / 1.25))
      else if (e.key === 'Escape') {
        if (panel) setPanel(null)
        else back()
      }
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  })

  if (error)
    return (
      <div className="screen">
        <ErrorBox title="PDFを表示できませんでした">{error}</ErrorBox>
        <button className="btn" style={{ marginTop: 12 }} onClick={() => go('/')}>
          本棚へ戻る
        </button>
      </div>
    )

  const record = pages.find((p) => p.pageIndex === page)
  const pageW = compare ? Math.min(bodyW - 24, 640) : Math.min(bodyW - 24, 900) * zoom

  return (
    <div className="viewer">
      <div className="v-top">
        <button className="icon-btn" aria-label={fromReader ? '高速読書へ戻る' : '本棚へ戻る'} onClick={back}>
          <Icon name="back" />
        </button>
        <div className="grow small" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {meta?.title}
        </div>
        <button className="icon-btn" aria-label="ページ一覧" aria-pressed={panel === 'thumbs'} onClick={() => setPanel(panel === 'thumbs' ? null : 'thumbs')}>
          <Icon name="grid" />
        </button>
        <button className="icon-btn" aria-label="目次" onClick={() => setPanel(panel === 'toc' ? null : 'toc')}>
          <Icon name="list" />
        </button>
        <button className="icon-btn" aria-label="本文検索" onClick={() => setPanel(panel === 'search' ? null : 'search')}>
          <Icon name="search" />
        </button>
        <button className="icon-btn" aria-label="しおり" onClick={() => setPanel(panel === 'marks' ? null : 'marks')}>
          <Icon name="bookmark" />
        </button>
      </div>

      <div className="v-body" ref={bodyRef}>
        {!doc ? (
          <p className="muted" style={{ margin: 'auto' }}>
            読み込み中…
          </p>
        ) : compare ? (
          <div className="compare">
            <PageCanvas doc={doc} page={page} width={Math.min(pageW, bodyW > 700 ? bodyW / 2 - 24 : pageW)} />
            <TextEditor
              key={`${page}-${record?.text.length}`}
              record={record}
              onSave={async (text) => {
                const rec: PageRecord = record
                  ? { ...record, text, source: text.trim() ? 'edited' : 'empty' }
                  : { bookId: id, pageIndex: page, text, contFromPrev: false, vertical: false, source: text.trim() ? 'edited' : 'empty' }
                await putPages([rec])
                const all = await getPages(id)
                await updateBook(id, (b) => {
                  b.textVersion++
                  b.emptyPages = all.filter((p) => p.source === 'empty').length
                })
                setPages(all)
                toast('このページの本文を保存しました')
              }}
            />
          </div>
        ) : (
          <div style={{ margin: '0 auto' }} onDoubleClick={() => setZoom((z) => (z > 1 ? 1 : 2))}>
            <PageCanvas doc={doc} page={page} width={pageW} />
          </div>
        )}
      </div>

      <div className="v-bottom">
        <button className="icon-btn" aria-label="前のページ" onClick={() => goPage(page - 1)} disabled={page === 0}>
          <Icon name="prev" />
        </button>
        <span className="small" style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
          {page + 1} / {n}
        </span>
        <button className="icon-btn" aria-label="次のページ" onClick={() => goPage(page + 1)} disabled={page >= n - 1}>
          <Icon name="next" />
        </button>
        {!compare && (
          <>
            <button className="icon-btn" aria-label="縮小" onClick={() => setZoom((z) => Math.max(0.5, z / 1.25))}>
              <Icon name="zoomOut" />
            </button>
            <button className="icon-btn" aria-label="拡大" onClick={() => setZoom((z) => Math.min(4, z * 1.25))}>
              <Icon name="zoomIn" />
            </button>
          </>
        )}
        <button className="btn small" aria-pressed={compare} onClick={() => setCompare(!compare)} title="抽出した本文と元のページを並べる">
          <Icon name="compare" /> {compare ? '比較を閉じる' : '比較'}
        </button>
        <button className="btn small primary" onClick={() => go(`/read/${id}?page=${page + 1}`)} title="このページから高速読書を始める">
          <Icon name="bolt" /> 速読
        </button>
      </div>

      {panel && doc && meta && (
        <>
          <div className="sheet-backdrop" onClick={() => setPanel(null)} />
          <div className="sheet stack" role="dialog">
            <div className="row">
              <div className="grow" style={{ fontWeight: 700, fontSize: 17 }}>
                {{ thumbs: 'ページ一覧', toc: '目次', search: '本文検索', marks: 'しおり' }[panel]}
              </div>
              <button className="icon-btn" aria-label="閉じる" onClick={() => setPanel(null)}>
                <Icon name="close" />
              </button>
            </div>
            {panel === 'thumbs' && (
              <Thumbs
                doc={doc}
                current={page}
                onPick={(p) => {
                  goPage(p)
                  setPanel(null)
                }}
              />
            )}
            {panel === 'toc' && (
              <Outline
                doc={doc}
                onPick={(p) => {
                  goPage(p)
                  setPanel(null)
                }}
              />
            )}
            {panel === 'search' && (
              <Search
                pages={pages}
                onPick={(p) => {
                  goPage(p)
                  setPanel(null)
                }}
              />
            )}
            {panel === 'marks' && (
              <Marks
                bookId={id}
                page={page}
                onPick={(p) => {
                  goPage(p)
                  setPanel(null)
                }}
              />
            )}
          </div>
        </>
      )}
    </div>
  )
}

function PageCanvas({ doc, page, width }: { doc: PDFDocumentProxy; page: number; width: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    if (!ref.current || width <= 0) return
    const ac = new AbortController()
    setErr(null)
    renderPage(doc, page, ref.current, width, ac.signal).catch(() => {
      if (!ac.signal.aborted) setErr('このページを描画できませんでした。')
    })
    return () => ac.abort()
  }, [doc, page, width])
  return (
    <div>
      <canvas ref={ref} className="v-page" />
      {err && <p className="small muted">{err}</p>}
    </div>
  )
}

function TextEditor({ record, onSave }: { record?: PageRecord; onSave: (text: string) => Promise<void> }) {
  const [text, setText] = useState(record?.text ?? '')
  const [saving, setSaving] = useState(false)
  const dirty = text !== (record?.text ?? '')
  const label = { text: 'PDFの文字から抽出', ocr: 'OCRで認識', edited: '手で修正済み', empty: '本文なし' }[record?.source ?? 'empty']
  return (
    <div className="stack">
      <div className="row small muted">
        <span className="grow">
          {label}
          {record?.confidence !== undefined ? `・信頼度 ${record.confidence.toFixed(0)}%` : ''}
        </span>
        <span>段落は改行、ルビは｜漢字《かんじ》</span>
      </div>
      <textarea value={text} onChange={(e) => setText(e.target.value)} aria-label="このページの本文" />
      <div className="row">
        <button
          className="btn primary"
          disabled={!dirty || saving}
          onClick={async () => {
            setSaving(true)
            try {
              await onSave(text)
            } finally {
              setSaving(false)
            }
          }}
        >
          本文を保存
        </button>
        <button className="btn" disabled={!dirty} onClick={() => setText(record?.text ?? '')}>
          元に戻す
        </button>
      </div>
    </div>
  )
}

function Thumbs({ doc, current, onPick }: { doc: PDFDocumentProxy; current: number; onPick: (p: number) => void }) {
  const ids = useMemo(() => Array.from({ length: doc.numPages }, (_, i) => i), [doc])
  return (
    <div className="thumbs">
      {ids.map((i) => (
        <Thumb key={i} doc={doc} page={i} current={i === current} onPick={onPick} />
      ))}
    </div>
  )
}

function Thumb({ doc, page, current, onPick }: { doc: PDFDocumentProxy; page: number; current: boolean; onPick: (p: number) => void }) {
  const ref = useRef<HTMLButtonElement>(null)
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    // 画面に入ったページだけ描画する（数百ページでもメモリを使い切らない）
    const io = new IntersectionObserver(async ([e]) => {
      if (!e.isIntersecting) return
      io.disconnect()
      try {
        const c = await renderToCanvas(doc, page, 220)
        setUrl(c.toDataURL('image/jpeg', 0.6))
        c.width = c.height = 0
      } catch {
        /* 描画できないページは番号だけ表示する */
      }
    })
    io.observe(el)
    if (current) el.scrollIntoView({ block: 'center' })
    return () => io.disconnect()
  }, [doc, page, current])
  return (
    <button ref={ref} className="thumb" aria-current={current} onClick={() => onPick(page)} aria-label={`${page + 1}ページ`}>
      {url && <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />}
      <span>{page + 1}</span>
    </button>
  )
}

function Outline({ doc, onPick }: { doc: PDFDocumentProxy; onPick: (p: number) => void }) {
  const [items, setItems] = useState<{ title: string; page: number; depth: number }[] | null>(null)
  useEffect(() => {
    readOutline(doc).then(setItems).catch(() => setItems([]))
  }, [doc])
  if (items === null) return <p className="small muted">読み込み中…</p>
  if (items.length === 0) return <p className="small muted">このPDFには目次（しおり）が入っていません。ページ一覧か本文検索を使ってください。</p>
  return (
    <ul className="list">
      {items.map((o, i) => (
        <li key={i}>
          <button onClick={() => onPick(o.page)} style={{ paddingLeft: 4 + o.depth * 16 }}>
            <span className="grow">{o.title}</span>
            <span className="small muted">p.{o.page + 1}</span>
          </button>
        </li>
      ))}
    </ul>
  )
}

function Search({ pages, onPick }: { pages: PageRecord[]; onPick: (p: number) => void }) {
  const [q, setQ] = useState('')
  const hits = useMemo(() => {
    const query = q.trim()
    if (!query) return []
    const out: { page: number; before: string; hit: string; after: string }[] = []
    for (const p of pages) {
      const t = parseRuby(p.text.replace(/\n/g, '')).text
      let i = t.indexOf(query)
      while (i >= 0 && out.length < 200) {
        out.push({ page: p.pageIndex, before: t.slice(Math.max(0, i - 16), i), hit: query, after: t.slice(i + query.length, i + query.length + 24) })
        i = t.indexOf(query, i + query.length)
      }
    }
    return out
  }, [q, pages])
  return (
    <div className="stack">
      <input type="search" placeholder="本文から探す" value={q} onChange={(e) => setQ(e.target.value)} autoFocus aria-label="検索語" />
      {q.trim() && <div className="small muted">{hits.length >= 200 ? '200件以上' : `${hits.length}件`}</div>}
      <ul className="list">
        {hits.map((h, i) => (
          <li key={i}>
            <button onClick={() => onPick(h.page)} className="hit">
              <span className="small muted" style={{ flex: 'none' }}>
                p.{h.page + 1}
              </span>
              <span className="grow small">
                …{h.before}
                <mark>{h.hit}</mark>
                {h.after}…
              </span>
            </button>
          </li>
        ))}
      </ul>
      <p className="small muted">抽出した本文を検索します。OCRがまだのページは検索できません。</p>
    </div>
  )
}

function Marks({ bookId, page, onPick }: { bookId: string; page: number; onPick: (p: number) => void }) {
  const [marks, setMarks] = useState<Bookmark[]>([])
  const load = () => listBookmarks(bookId).then(setMarks)
  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId])
  return (
    <div className="stack">
      <button
        className="btn primary"
        onClick={async () => {
          await addBookmark({ bookId, page, label: `${page + 1}ページ`, createdAt: Date.now() })
          toast(`${page + 1}ページにしおりを挟みました`)
          load()
        }}
      >
        <Icon name="bookmark" /> このページ（p.{page + 1}）にしおり
      </button>
      {marks.length === 0 ? (
        <p className="small muted">しおりはまだありません。</p>
      ) : (
        <ul className="list">
          {marks.map((m) => (
            <li key={m.id} className="row">
              <button className="grow" onClick={() => onPick(m.page)}>
                <span className="grow">{m.label}</span>
              </button>
              <button
                className="icon-btn"
                aria-label="しおりを削除"
                onClick={async () => {
                  await deleteBookmark(m.id!)
                  load()
                }}
              >
                <Icon name="trash" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
