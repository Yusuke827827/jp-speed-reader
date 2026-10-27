import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { gapBefore, globalOffset, pageAt, referenceParagraphs, percentAt, positionForPage, type BookText, type Paragraph, type TextPosition } from '../lib/book'
import { addSession, describeStorageError, listBookmarks, saveProgress, getFile, updateBook, type Bookmark, type Person, type TocEntry } from '../lib/db'
import { newId } from '../lib/importer'
import { chapterStarts, personRanges, personTerms, suggestPeople, PERSON_COLORS, type PersonRange } from '../lib/people'
import { closePdf, openPdf, readOutline } from '../lib/pdf'
import { chunkIndexAt, isLatinBook, paragraphStartIndex, segmentBook, CHUNK_MODES, visible, type Chunk } from '../lib/segment'
import { THEMES, themeOf, useSettings, type Settings } from '../lib/settings'
import { buildSchedule, durationOf, remainingMs, SPEED_PRESETS, CPM_MAX, CPM_MIN, WPM_PRESETS, WPM_MAX, WPM_MIN } from '../lib/timing'
import { useBook, type LoadedBook } from '../lib/useBook'
import { ConfirmDialog, ErrorBox, formatDuration, go, Icon, toast } from './common'
import { RichText } from './rich'
import { IllustView, loadIllust, releaseIllusts } from './IllustView'
import { t } from '../lib/i18n'

export function Reader({ id, startPage }: { id: string; startPage?: number }) {
  const { book, error, loading } = useBook(id)
  const [settings] = useSettings()
  if (loading) return <div className="screen muted">{t('読み込み中…')}</div>
  if (error || !book)
    return (
      <div className="screen">
        <ErrorBox title={t('本を開けませんでした')}>{error}</ErrorBox>
        <button className="btn" style={{ marginTop: 12 }} onClick={() => go('/')}>
          {t('本棚へ戻る')}
        </button>
      </div>
    )
  if (book.text.totalChars === 0)
    return (
      <div className="screen">
        <header className="topbar">
          <button className="icon-btn" aria-label={t('本棚へ戻る')} onClick={() => go('/')}>
            <Icon name="back" />
          </button>
          <h1>{book.meta.title}</h1>
        </header>
        <div className="notice">
          <strong>{t('まだ読める本文がありません')}</strong>
          {t('このPDFは画像だけでできているため、文字認識（OCR）が必要です。')}
          <div className="row" style={{ marginTop: 10 }}>
            <button className="btn primary" onClick={() => go(`/ocr/${id}`)}>
              <Icon name="scan" /> {t('OCRへ進む')}
            </button>
            <button className="btn" onClick={() => go(`/pdf/${id}`)}>
              {t('PDFをそのまま見る')}
            </button>
          </div>
        </div>
      </div>
    )
  return <ReaderView book={book} settings={settings} startPage={startPage} />
}

const RAMP = [1.7, 1.4, 1.2, 1.08]

function ReaderView({ book, settings, startPage }: { book: LoadedBook; settings: Settings; startPage?: number }) {
  const [, update] = useSettings()
  const { meta, text } = book
  const isPdf = meta.kind !== 'text'
  const [people, setPeople] = useState<Person[]>(meta.people ?? [])
  const names = useMemo(() => personTerms(people), [people])
  const chunks = useMemo(() => {
    const all = segmentBook(text, { mode: settings.mode, phraseTarget: settings.phraseTarget, minChars: settings.minChars, names })
    // テキストの本には挿絵が無い。「飛ばす」設定なら挿絵の単位を除く
    const noIllust = !isPdf || settings.illustMode === 'skip'
    // 参考文献の節を飛ばす（全部が参考文献と判定された場合は飛ばさない）
    const refs = settings.skipReferences ? referenceParagraphs(text) : new Set<number>()
    const skipRefs = refs.size > 0 && refs.size < text.paragraphs.length
    return noIllust || skipRefs ? all.filter((c) => !(noIllust && c.illust) && !(skipRefs && refs.has(c.para))) : all
  }, [text, settings.mode, settings.phraseTarget, settings.minChars, names, settings.illustMode, settings.skipReferences, isPdf])
  const schedule = useMemo(
    () =>
      buildSchedule(chunks, {
        cpm: settings.cpm,
        wpm: settings.wpm,
        pauses: settings.pauses,
        pauseScale: settings.pauseScale,
        nameBoost: settings.nameBoost && people.length > 0,
        illustMs: settings.illustSeconds * 1000,
      }),
    [chunks, settings.cpm, settings.wpm, settings.pauses, settings.pauseScale, settings.nameBoost, people.length, settings.illustSeconds],
  )

  // 段落ごとの人物名の位置（表示のたびに探さないよう覚えておく）
  const rangesOf = useMemo(() => {
    const cache = new Map<number, PersonRange[]>()
    return (pi: number) => {
      let r = cache.get(pi)
      if (!r) {
        r = people.length ? personRanges(text.paragraphs[pi]?.text ?? '', people) : []
        cache.set(pi, r)
      }
      return r
    }
  }, [text, people])

  // 人物の説明を出す単位。「章の最初の3回」は目次の見出しごとに数え直す
  const labels = useMemo(() => {
    const out = new Map<number, Person[]>()
    if (settings.personLabel === 'off' || !people.some((p) => p.label)) return out
    const starts = new Set(chapterStarts(text, (meta.toc ?? []).map((t) => t.page)))
    const seen = new Map<string, number>()
    let lastPara = -1
    chunks.forEach((c, i) => {
      if (c.para !== lastPara) {
        if (settings.personLabel === 'chapter3' && starts.has(c.para)) seen.clear()
        lastPara = c.para
      }
      if (!c.name) return
      const show: Person[] = []
      for (const h of rangesOf(c.para)) {
        if (!(h.start < c.end && c.start < h.end)) continue
        const n = (seen.get(h.person.id) ?? 0) + 1
        seen.set(h.person.id, n)
        if (h.person.label && (settings.personLabel === 'always' || n <= 3) && !show.includes(h.person)) show.push(h.person)
      }
      if (show.length) out.set(i, show)
    })
    return out
  }, [chunks, people, rangesOf, settings.personLabel, text, meta.toc])

  const savePeople = useCallback(
    (next: Person[]) => {
      setPeople(next)
      updateBook(meta.id, (b) => (b.people = next)).catch(() => toast(t('人物の保存に失敗しました')))
    },
    [meta.id],
  )

  // ---------- 位置 ----------
  const initialPos = useMemo<TextPosition>(() => {
    if (startPage !== undefined) return positionForPage(text, startPage)
    const p = book.progress
    if (!p) return { para: 0, offset: 0 }
    // OCR などで本文が変わった後は、段落番号がずれるのでページから位置を引き直す
    if (p.textVersion !== meta.textVersion) return positionForPage(text, p.page)
    return { para: p.para, offset: p.offset }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [index, setIndex] = useState(() => chunkIndexAt(chunks, initialPos))
  const [playing, setPlaying] = useState(false)
  const posRef = useRef<TextPosition>(initialPos)
  const chunk: Chunk | undefined = chunks[index]

  // 分割単位を変えたときも、同じ本文位置にとどまる
  const prevChunks = useRef(chunks)
  useEffect(() => {
    if (prevChunks.current !== chunks) {
      prevChunks.current = chunks
      setIndex(chunkIndexAt(chunks, posRef.current))
    }
  }, [chunks])
  useEffect(() => {
    if (chunk) posRef.current = { para: chunk.para, offset: chunk.start }
  }, [chunk])

  // ---------- 読書時間と保存 ----------
  const readingMs = useRef(book.progress?.readingMs ?? 0)
  const session = useRef<{ start: number; startIndex: number; startPct: number; chars: number } | null>(null)
  const lastTick = useRef(0)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [measured, setMeasured] = useState<number | null>(null)

  const persist = useCallback(async () => {
    const pos = posRef.current
    try {
      await saveProgress({
        bookId: meta.id,
        para: pos.para,
        offset: pos.offset,
        page: pageAt(text, pos),
        percent: percentAt(text, pos),
        readingMs: readingMs.current,
        lastReadAt: Date.now(),
        textVersion: meta.textVersion,
      })
      setSaveError(null)
    } catch (e) {
      setSaveError(describeStorageError(e))
    }
  }, [meta.id, meta.textVersion, text])

  const endSession = useCallback(() => {
    const s = session.current
    if (!s) return
    session.current = null
    const now = Date.now()
    const ms = now - s.start
    addSession({
      bookId: meta.id,
      title: meta.title,
      start: s.start,
      end: now,
      ms,
      chars: s.chars,
      fromPercent: s.startPct,
      toPercent: percentAt(text, posRef.current),
      cpm: ms > 0 ? Math.round((s.chars / ms) * 60000) : 0,
    }).catch(() => {})
    if (ms > 2000) setMeasured(Math.round((s.chars / ms) * 60000))
  }, [meta.id, meta.title, text])

  // ---------- 再生タイマー ----------
  // setTimeout を毎回「予定時刻」から逆算してかけ直し、遅れが積み重ならないようにする
  const timer = useRef<number | undefined>(undefined)
  const due = useRef(0)
  const ramp = useRef(0)
  const indexRef = useRef(index)
  indexRef.current = index

  useEffect(() => {
    if (!playing) return
    const step = () => {
      const i = indexRef.current
      if (i >= chunks.length - 1) {
        setPlaying(false)
        toast(t('最後まで読みました'))
        return
      }
      const next = i + 1
      const now = performance.now()
      if (session.current) session.current.chars += chunks[i].len
      readingMs.current += now - lastTick.current
      lastTick.current = now
      setIndex(next)
      // 挿絵で止まる設定なら、挿絵を出したところで一時停止する
      if (chunks[next].illust && settings.illustMode === 'pause') {
        setPlaying(false)
        endSession()
        persist()
        return
      }
      const mult = settings.rampUp && ramp.current < RAMP.length ? RAMP[ramp.current++] : 1
      due.current += durationOf(schedule, next) * mult
      timer.current = window.setTimeout(step, Math.max(0, due.current - performance.now()))
    }
    const now = performance.now()
    lastTick.current = now
    ramp.current = 0
    const mult = settings.rampUp ? RAMP[ramp.current++] : 1
    due.current = now + durationOf(schedule, indexRef.current) * mult
    timer.current = window.setTimeout(step, durationOf(schedule, indexRef.current) * mult)
    return () => {
      window.clearTimeout(timer.current)
      readingMs.current += performance.now() - lastTick.current
      lastTick.current = performance.now()
    }
  }, [playing, chunks, schedule, settings.rampUp, settings.illustMode, endSession, persist])

  const play = useCallback(() => {
    if (indexRef.current >= chunks.length - 1) setIndex(0)
    // 挿絵で止まっていたら、次の本文から再開する
    else if (chunks[indexRef.current]?.illust && settings.illustMode === 'pause') setIndex(indexRef.current + 1)
    session.current = { start: Date.now(), startIndex: indexRef.current, startPct: percentAt(text, posRef.current), chars: 0 }
    setMeasured(null)
    setPlaying(true)
  }, [chunks, text, settings.illustMode])

  const pause = useCallback(() => {
    setPlaying(false)
    endSession()
    persist()
  }, [endSession, persist])

  const toggle = useCallback(() => (playing ? pause() : play()), [playing, pause, play])

  // 再生中は 5 秒ごとに位置を保存。画面を離れる・隠れるときは必ず保存して止める
  useEffect(() => {
    if (!playing) return
    const t = window.setInterval(persist, 5000)
    return () => window.clearInterval(t)
  }, [playing, persist])
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') {
        if (session.current) pause()
        else persist()
      }
    }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('pagehide', onHide)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('pagehide', onHide)
    }
  }, [pause, persist])
  useEffect(
    () => () => {
      endSession()
      persist()
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  // 一時停止中の移動も保存する
  useEffect(() => {
    if (playing) return
    const t = window.setTimeout(persist, 600)
    return () => window.clearTimeout(t)
  }, [index, playing, persist])

  // 再生中は画面のスリープを防ぐ（対応ブラウザのみ）
  useEffect(() => {
    if (!playing) return
    type WL = { release: () => Promise<void> }
    let lock: WL | undefined
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<WL> } }
    nav.wakeLock?.request('screen').then((l) => (lock = l)).catch(() => {})
    return () => {
      lock?.release().catch(() => {})
    }
  }, [playing])

  // ---------- 移動 ----------
  const moveTo = useCallback(
    (i: number) => {
      const n = Math.max(0, Math.min(chunks.length - 1, i))
      if (playing) {
        // 再生中の移動は、タイマーをかけ直して新しい位置から続ける
        setPlaying(false)
        setIndex(n)
        requestAnimationFrame(() => setPlaying(true))
      } else setIndex(n)
    },
    [chunks.length, playing],
  )
  const prev = () => moveTo(index - 1)
  const next = () => moveTo(index + 1)
  const prevPara = () => {
    const s = paragraphStartIndex(chunks, index)
    moveTo(s < index ? s : paragraphStartIndex(chunks, Math.max(0, s - 1)))
  }
  const nextPara = () => {
    let i = index
    const p = chunks[index]?.para
    while (i < chunks.length - 1 && chunks[i].para === p) i++
    moveTo(i)
  }
  const [confirmRestart, setConfirmRestart] = useState(false)
  // 欧文が主の本は語/分（WPM）、それ以外は字/分で速度を表示・調整する
  const latin = useMemo(() => isLatinBook(chunks), [chunks])
  const changeSpeed = (dir: 1 | -1) =>
    latin
      ? update({ wpm: Math.max(WPM_MIN, Math.min(WPM_MAX, settings.wpm + dir * 10)) })
      : update({ cpm: Math.max(CPM_MIN, Math.min(CPM_MAX, Math.round(settings.cpm + dir * 50))) })

  // ---------- 操作 ----------
  const [sheet, setSheet] = useState<null | 'settings' | 'toc' | 'people'>(null)
  const openPdfView = () => {
    if (playing) pause()
    persist().then(() => go(`/pdf/${meta.id}?page=${pageAt(text, posRef.current) + 1}&from=read`))
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      switch (e.key) {
        case 'Enter':
          // ボタンにフォーカスがあるときは、そのボタンの操作を優先する
          if (sheet || e.target instanceof HTMLButtonElement) return
          e.preventDefault()
          toggle()
          break
        case ' ':
          if (sheet) return
          e.preventDefault()
          toggle()
          break
        case 'ArrowRight':
          e.preventDefault()
          if (e.shiftKey) nextPara()
          else next()
          break
        case 'ArrowLeft':
          e.preventDefault()
          if (e.shiftKey) prevPara()
          else prev()
          break
        case 'ArrowDown':
          e.preventDefault()
          nextPara()
          break
        case 'ArrowUp':
          e.preventDefault()
          prevPara()
          break
        case '+':
        case '=':
          changeSpeed(1)
          break
        case '-':
          changeSpeed(-1)
          break
        case ']':
          update({ fontSize: Math.min(120, settings.fontSize + 4) })
          break
        case '[':
          update({ fontSize: Math.max(20, settings.fontSize - 4) })
          break
        case 'Home':
          setConfirmRestart(true)
          break
        case 'Escape':
          if (sheet) setSheet(null)
          else if (playing) pause()
          else go('/')
          break
        case 'p':
          if (isPdf) openPdfView()
          break
        case 't': {
          const i = THEMES.findIndex((t) => t.id === settings.theme)
          update({ theme: THEMES[(i + 1) % THEMES.length].id })
          break
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // スワイプ（一時停止中のみ）: 左右で 1 単位、タップで再生／停止
  const touch = useRef<{ x: number; y: number; t: number } | null>(null)
  const onPointerDown = (e: React.PointerEvent) => {
    touch.current = { x: e.clientX, y: e.clientY, t: Date.now() }
  }
  const onPointerUp = (e: React.PointerEvent) => {
    const s = touch.current
    touch.current = null
    if (!s) return
    const dx = e.clientX - s.x
    const dy = e.clientY - s.y
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5 && !playing) {
      // 縦書きの本に合わせ、右から左へのスワイプで先へ進む（本のページをめくる向き）
      if (dx < 0) next()
      else prev()
      return
    }
    if (Math.abs(dx) < 12 && Math.abs(dy) < 12) toggle()
  }

  // ---------- 表示 ----------
  const theme = themeOf(settings.theme)
  const pos = chunk ? { para: chunk.para, offset: chunk.start } : posRef.current
  const percent = percentAt(text, pos)
  const page = pageAt(text, pos)
  const remain = remainingMs(chunks, schedule, index)
  const showBars = !playing || settings.showProgressWhilePlaying

  // 次の挿絵を先に用意しておき、表示のときに待たせない
  useEffect(() => {
    if (!isPdf) return
    for (let i = index + 1; i < Math.min(chunks.length, index + 60); i++) {
      const il = chunks[i].illust
      if (il) {
        loadIllust(meta.id, il).catch(() => {})
        break
      }
    }
  }, [index, chunks, isPdf, meta.id])
  useEffect(() => releaseIllusts, [])
  // 挿絵を出しているあいだは全文パネルを隠し、絵を大きく見せる
  const showPanel = !playing && settings.showContext && !chunk?.illust
  const readChars = chunk ? globalOffset(text, { para: chunk.para, offset: chunk.end }) : 0

  return (
    <div
      className={`reader bg-${theme.id}${theme.art || settings.wallpaperOn ? ' art' : ''}${theme.dark ? ' dark' : ''}${settings.wallpaperOn ? ' has-wallpaper' : ''}${playing ? ' playing' : ''}`}
      style={
        {
          '--r-bg': theme.bg,
          '--r-fg': theme.fg,
          '--r-accent': settings.accent || theme.accent,
        } as React.CSSProperties
      }
    >
      <div className="r-top">
        <button className="icon-btn" aria-label={t('本棚へ戻る')} title={t('本棚へ戻る (Esc)')} onClick={() => go('/')}>
          <Icon name="back" />
        </button>
        <div className="r-title">
          <b>{meta.title}</b>
          {meta.author && <span className="r-author">{meta.author}</span>}
        </div>
        <div className="r-keys" aria-hidden="true">
          {t('Space 再生/停止・←→ 1単位・Shift+←→ 段落・+− 速度')}
        </div>
        <button className="icon-btn" aria-label={t('目次・ページ移動')} title={t('目次・ページ移動')} onClick={() => setSheet('toc')}>
          <Icon name="list" />
        </button>
        <button className="icon-btn" aria-label={t('人物')} title={t('人物の登録と色分け')} onClick={() => setSheet('people')}>
          <Icon name="people" />
        </button>
        {isPdf && (
          <button className="icon-btn" aria-label={t('元のPDFを見る')} title={t('元のPDFを見る (P)')} onClick={openPdfView}>
            <Icon name="pdf" />
          </button>
        )}
        <button className="icon-btn" aria-label={t('読書設定')} title={t('読書設定')} onClick={() => setSheet('settings')}>
          <Icon name="settings" />
        </button>
      </div>

      <div className={`stage${showPanel ? ' with-panel' : ''}${settings.direction === 'vertical' ? ' vertical' : ''}`}>
        <div className="word-area" onPointerDown={onPointerDown} onPointerUp={onPointerUp} role="button" aria-label={playing ? t('一時停止') : t('再生')}>
          {chunk?.illust ? (
            <IllustView bookId={meta.id} illust={chunk.illust} note={settings.illustMode === 'pause' && !playing ? t('タップで続きを読む') : ''} />
          ) : (
            chunk && <Word chunk={chunk} para={text.paragraphs[chunk.para]} names={rangesOf(chunk.para)} labels={labels.get(index)} settings={settings} />
          )}
        </div>
        {showPanel && chunk && <TextPanel book={text} chunks={chunks} index={index} rangesOf={rangesOf} settings={settings} onPick={setIndex} />}
      </div>

      <div className="r-bottom">
        {saveError && (
          <div className="notice error small" style={{ marginBottom: 8, color: 'var(--text)' }}>
            {t('読書位置を保存できませんでした。')}{saveError}
          </div>
        )}
        {showBars && (
          <>
            <div className="r-meta">
              <span>
                {t('{read} / {total}字・{percent}%', { read: readChars.toLocaleString(), total: text.totalChars.toLocaleString(), percent: percent.toFixed(1) })}
                {isPdf && t('・p.{page}/{pages}', { page: page + 1, pages: meta.pageCount })}
              </span>
              <span>
                {measured !== null && !playing ? (
                  <span title={t('直前の再生で実際に表示した文字数 ÷ 経過時間。再生直後の減速と、句読点の間を含みます')}>{t('実測 {n}字/分・', { n: measured })}</span>
                ) : (
                  ''
                )}
                {t('残り{time}', { time: formatDuration(remain) })}
              </span>
            </div>
            {playing ? (
              <div className="r-progress">
                <div style={{ width: `${percent}%` }} />
              </div>
            ) : (
              <input
                className="scrub"
                type="range"
                min={0}
                max={Math.max(0, chunks.length - 1)}
                value={index}
                aria-label={t('読書位置')}
                onChange={(e) => setIndex(Number(e.target.value))}
              />
            )}
          </>
        )}
        <div className="controls">
          <button className="icon-btn" aria-label={t('前の段落')} title={t('前の段落 (↑)')} onClick={prevPara}>
            <Icon name="prevPara" />
          </button>
          <button className="icon-btn" aria-label={t('1単位戻る')} title={t('1単位戻る (←)')} onClick={prev}>
            <Icon name="prev" />
          </button>
          <button className="icon-btn play" aria-label={playing ? t('一時停止') : t('再生')} title={t('再生／一時停止 (Space)')} onClick={toggle}>
            <Icon name={playing ? 'pause' : 'play'} />
          </button>
          <button className="icon-btn" aria-label={t('1単位進む')} title={t('1単位進む (→)')} onClick={next}>
            <Icon name="next" />
          </button>
          <button className="icon-btn" aria-label={t('次の段落')} title={t('次の段落 (↓)')} onClick={nextPara}>
            <Icon name="nextPara" />
          </button>
        </div>
        <div className="speedrow">
          <button className="speed-btn" aria-label={t('遅くする')} onClick={() => changeSpeed(-1)}>
            −
          </button>
          <button className="speed-btn grow" onClick={() => setSheet('settings')} aria-label={t('速度と表示の設定')}>
            {latin ? `${settings.wpm} WPM` : t('{n} 字/分', { n: settings.cpm })}
            {schedule.limited ? t('（上限）') : ''}
          </button>
          <button className="speed-btn" aria-label={t('速くする')} onClick={() => changeSpeed(1)}>
            {'\uFF0B'}
          </button>
          <button className="speed-btn" aria-label={t('最初から読む')} title={t('最初から読む (Home)')} onClick={() => setConfirmRestart(true)}>
            <Icon name="restart" />
          </button>
        </div>
      </div>

      {sheet === 'settings' && <QuickSettings onClose={() => setSheet(null)} chunks={chunks} latin={latin} />}
      {sheet === 'people' && <PeopleSheet book={book} people={people} onChange={savePeople} onClose={() => setSheet(null)} />}
      {sheet === 'toc' && (
        <TocSheet
          book={book}
          currentPage={page}
          onClose={() => setSheet(null)}
          onJump={(pg) => {
            setSheet(null)
            moveTo(chunkIndexAt(chunks, positionForPage(text, pg)))
          }}
          onJumpPercent={(pct) => {
            setSheet(null)
            const target = (pct / 100) * text.totalChars
            const i = chunks.findIndex((c) => globalOffset(text, { para: c.para, offset: c.end }) > target)
            moveTo(i < 0 ? chunks.length - 1 : i)
          }}
        />
      )}
      {confirmRestart && (
        <ConfirmDialog
          title={t('最初から読みますか？')}
          body={t('読書位置を本の先頭に戻します。今の位置は「目次・ページ移動」から割合やページで戻れます。')}
          confirmLabel={t('最初から読む')}
          onCancel={() => setConfirmRestart(false)}
          onConfirm={() => {
            setConfirmRestart(false)
            moveTo(0)
          }}
        />
      )}
    </div>
  )
}

/** 中央の 1 単位。長さに応じて文字サイズを下げ、画面からはみ出さないようにする */
function Word({ chunk, para, names, labels, settings }: { chunk: Chunk; para: Paragraph; names: PersonRange[]; labels?: Person[]; settings: Settings }) {
  const areaRef = useRef<HTMLDivElement | null>(null)
  const [box, setBox] = useState({ w: 360, h: 600 })
  useLayoutEffect(() => {
    const el = areaRef.current?.parentElement
    if (!el) return
    const ro = new ResizeObserver(() => setBox({ w: el.clientWidth, h: el.clientHeight }))
    ro.observe(el)
    setBox({ w: el.clientWidth, h: el.clientHeight })
    return () => ro.disconnect()
  }, [])

  const vertical = settings.direction === 'vertical'
  const len = Math.max(1, visibleWidth(chunk.text))
  const room = (vertical ? box.h * 0.78 : box.w * 0.9) / (len * 1.04)
  const size = Math.max(14, Math.min(settings.fontSize, room))

  // 注視点: 単位の前寄り（約 1/3）の文字。日本語は語頭の漢字を捉えると読みやすい
  const slice = para.text.slice(chunk.start, chunk.end)
  const fi = settings.guide === 'focus' && slice.length > 1 ? chunk.start + focusIndex([...slice]) : undefined
  const wordRef = useRef<HTMLDivElement | null>(null)
  const focusRef = useRef<HTMLSpanElement | null>(null)
  const [shift, setShift] = useState(0)
  useLayoutEffect(() => {
    // 注視点の文字を常に画面中央に置く。ずらした結果はみ出す場合は、はみ出さない範囲に抑える
    if (fi === undefined || !wordRef.current || !focusRef.current) {
      setShift(0)
      return
    }
    const w = wordRef.current
    const f = focusRef.current
    const full = vertical ? w.scrollHeight : w.scrollWidth
    const at = vertical ? f.offsetTop + f.offsetHeight / 2 : f.offsetLeft + f.offsetWidth / 2
    const want = full / 2 - at
    const limit = Math.max(0, ((vertical ? box.h : box.w) * 0.96 - full) / 2)
    setShift(Math.max(-limit, Math.min(limit, want)))
  }, [chunk, fi, size, vertical, box])

  const family = settings.font === 'mincho' ? 'var(--font-mincho)' : 'var(--font-gothic)'
  return (
    <div ref={areaRef} className="word-wrap">
      {settings.guide !== 'none' &&
        (vertical ? (
          <>
            <div className="guide h" style={{ left: `calc(50% - ${size * 0.9 + 18}px)` }} />
            <div className="guide h" style={{ left: `calc(50% + ${size * 0.9 + 4}px)` }} />
          </>
        ) : (
          <>
            <div className="guide" style={{ top: `calc(50% - ${size * 0.95 + 20}px)` }} />
            <div className="guide" style={{ top: `calc(50% + ${size * 0.75 + 6}px)` }} />
          </>
        ))}
      <div
        ref={wordRef}
        className={`word${vertical ? ' vertical' : ''}`}
        style={{ fontSize: size, fontFamily: family, transform: vertical ? `translateY(${shift}px)` : `translateX(${shift}px)` }}
        aria-live="off"
      >
        <RichText para={para} start={chunk.start} end={chunk.end} names={names} opts={{ ruby: true, colors: settings.personColors, focusAt: fi, focusRef, trimEdges: true, keepSpaces: true }} />
      </div>
      {labels && labels.length > 0 && (
        <div className="person-label" style={vertical ? { bottom: 4 } : { top: `calc(50% + ${size * 0.75 + 26}px)` }}>
          {labels.map((p) => (
            <span key={p.id} style={{ color: settings.personColors ? p.color : undefined }}>
              {p.label}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

/** 全角を 1、半角を 0.55 として幅を見積もる */
function visibleWidth(s: string): number {
  let w = 0
  for (const c of s) {
    if (/\s/.test(c)) continue
    w += /[\x20-\x7E｡-ﾟ]/.test(c) ? 0.55 : 1 // i18n-ignore: 半角カナの範囲（文字幅の判定。画面の文言ではない）
  }
  return w
}

function focusIndex(chars: string[]): number {
  const isMark = (c: string) => /[「『（(【〈《〔、。，．！？!?」』）)】〉》〕…―]/.test(c) // i18n-ignore: 括弧・句読点の判定（画面の文言ではない）
  let target = Math.floor((chars.length - 1) / 3)
  // 括弧や句読点を避け、近い文字に寄せる
  while (target < chars.length - 1 && isMark(chars[target])) target++
  while (target > 0 && isMark(chars[target])) target--
  return target
}

/** 一時停止中に出す全文パネル。今の単位を強調し、タップした単位へ移動する */
function TextPanel(props: {
  book: BookText
  chunks: Chunk[]
  index: number
  rangesOf: (pi: number) => PersonRange[]
  settings: Settings
  onPick: (i: number) => void
}) {
  const { book, chunks, index } = props
  const cur = chunks[index]
  // 長編でも重くならないよう、今の段落の前後だけを描く
  const from = Math.max(0, cur.para - 12)
  const to = Math.min(book.paragraphs.length, cur.para + 30)
  const first = useMemo(() => {
    let lo = 0
    let hi = chunks.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (chunks[mid].para < from) lo = mid + 1
      else hi = mid
    }
    return lo
  }, [chunks, from])
  const currentRef = useRef<HTMLSpanElement | null>(null)
  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: 'center' })
  }, [index])

  const paras: ReactNode[] = []
  let i = first
  for (let pi = from; pi < to; pi++) {
    const para = book.paragraphs[pi]
    const names = props.rangesOf(pi)
    const spans: ReactNode[] = []
    let prevEnd = -1
    while (i < chunks.length && chunks[i].para === pi) {
      const c = chunks[i]
      const k = i
      // 欧文の文と文の間の空白は、どの単位にも含まれないので、ここで描く
      const gap = prevEnd >= 0 ? gapBefore(para, prevEnd, c.start) : ''
      if (gap) spans.push(gap)
      prevEnd = c.end
      if (c.illust) {
        spans.push(
          <span key={k} ref={k === index ? currentRef : undefined} className={`illust-ref${k === index ? ' cur' : ''}`} onClick={() => props.onPick(k)}>
            {t('［挿絵 p.{page}］', { page: c.illust.page + 1 })}
          </span>,
        )
        i++
        continue
      }
      spans.push(
        <span key={k} ref={k === index ? currentRef : undefined} className={k === index ? 'cur' : undefined} onClick={() => props.onPick(k)}>
          <RichText para={para} start={c.start} end={c.end} names={names} opts={{ ruby: true, colors: props.settings.personColors }} />
        </span>,
      )
      i++
    }
    paras.push(<p key={pi}>{spans}</p>)
  }
  return (
    <div className="text-panel" aria-label={t('本文')} onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()}>
      {from > 0 && <p className="muted-line">…</p>}
      {paras}
      {to < book.paragraphs.length && <p className="muted-line">…</p>}
    </div>
  )
}

function QuickSettings({ onClose, chunks, latin }: { onClose: () => void; chunks: Chunk[]; latin: boolean }) {
  const [s, update] = useSettings()
  const [custom, setCustom] = useState(String(s.cpm))
  useEffect(() => setCustom(String(s.cpm)), [s.cpm])
  const avgLen = chunks.length ? chunks.reduce((a, c) => a + c.len, 0) / chunks.length : 0
  // 参考WPM: BudouX の文節を「語」とみなした値（英語の WPM と厳密には比べられない）
  const wordsPerChunk = useMemo(() => {
    const sample = chunks.slice(0, 400).map((c) => c.text).join('')
    if (!sample) return 0
    const phrases = segmentLikeWords(sample)
    return phrases / Math.max(1, visible(sample))
  }, [chunks])
  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet stack" role="dialog" aria-label={t('読書設定')}>
        <div className="row">
          <div className="grow" style={{ fontWeight: 700, fontSize: 17 }}>
            {t('読書設定')}
          </div>
          <button className="icon-btn" aria-label={t('閉じる')} onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>

        {latin && <WpmField />}

        <div className="field" hidden={latin}>
          <div className="label">
            <span>{t('速度')}</span>
            <span>
              {t('{cpm}字/分・{units}単位/分・参考 約{wpm}WPM', { cpm: s.cpm, units: avgLen ? Math.round(s.cpm / avgLen) : 0, wpm: Math.round(s.cpm * wordsPerChunk) })}
            </span>
          </div>
          <div className="segmented" role="group" aria-label={t('速度のプリセット')}>
            {SPEED_PRESETS.map((p) => (
              <button key={p.cpm} aria-pressed={s.cpm === p.cpm} onClick={() => update({ cpm: p.cpm })}>
                {t(p.label)}
                <span className="small muted"> {p.cpm}</span>
              </button>
            ))}
          </div>
          <input type="range" min={CPM_MIN} max={2000} step={10} value={Math.min(2000, s.cpm)} onChange={(e) => update({ cpm: Number(e.target.value) })} aria-label={t('速度（字/分）')} />
          <div className="row">
            <span className="small muted">{t('数値で指定')}</span>
            <input
              type="number"
              inputMode="numeric"
              min={CPM_MIN}
              max={CPM_MAX}
              value={custom}
              style={{ maxWidth: 120 }}
              onChange={(e) => setCustom(e.target.value)}
              onBlur={() => {
                const v = Number(custom)
                if (Number.isFinite(v) && v > 0) update({ cpm: Math.max(CPM_MIN, Math.min(CPM_MAX, Math.round(v))) })
                else setCustom(String(s.cpm))
              }}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              aria-label={t('速度を数値で入力')}
            />
            <span className="small muted">{t('字/分（{min}〜{max}）', { min: CPM_MIN, max: CPM_MAX })}</span>
          </div>
        </div>

        <div className="field">
          <div className="label">{t('分割の単位')}</div>
          <div className="segmented" role="group">
            {CHUNK_MODES.map((m) => (
              <button key={m.id} aria-pressed={s.mode === m.id} title={t(m.hint)} onClick={() => update({ mode: m.id })}>
                {t(m.label)}
              </button>
            ))}
          </div>
          <div className="label" style={{ marginTop: 8 }}>
            <span>{t('最小の字数（これより短い単位は隣とつなぐ）')}</span>
          </div>
          <div className="segmented" role="group" aria-label={t('最小の字数')}>
            {[1, 2, 3, 4].map((n) => (
              <button key={n} aria-pressed={s.minChars === n} onClick={() => update({ minChars: n })}>
                {n === 1 ? t('なし') : t('{n}字以上', { n })}
              </button>
            ))}
          </div>
          {s.mode === 'phrase' && (
            <>
              <div className="label" style={{ marginTop: 8 }}>
                <span>{t('フレーズの目標文字数')}</span>
                <span>{t('{n}文字', { n: s.phraseTarget })}</span>
              </div>
              <input type="range" min={4} max={14} value={s.phraseTarget} onChange={(e) => update({ phraseTarget: Number(e.target.value) })} aria-label={t('フレーズの目標文字数')} />
            </>
          )}
        </div>

        <div className="field">
          <div className="label">{t('挿絵の位置に来たら')}</div>
          <div className="segmented" role="group">
            {(
              [
                ['pause', t('止まる')],
                ['show', t('{n}秒表示', { n: s.illustSeconds })],
                ['skip', t('飛ばす')],
              ] as const
            ).map(([v, l]) => (
              <button key={v} aria-pressed={s.illustMode === v} onClick={() => update({ illustMode: v })}>
                {l}
              </button>
            ))}
          </div>
          {s.illustMode === 'show' && (
            <input type="range" min={1} max={15} value={s.illustSeconds} onChange={(e) => update({ illustSeconds: Number(e.target.value) })} aria-label={t('挿絵を表示する秒数')} />
          )}
        </div>

        <div className="field">
          <div className="label">
            <span>{t('文字サイズ')}</span>
            <span>{s.fontSize}px</span>
          </div>
          <input type="range" min={20} max={120} step={2} value={s.fontSize} onChange={(e) => update({ fontSize: Number(e.target.value) })} aria-label={t('文字サイズ')} />
        </div>

        <div className="field">
          <div className="label">{t('画面の言語')}</div>
          <div className="segmented" role="group">
            {(
              [
                ['auto', t('自動（端末の言語）')],
                ['ja', t('日本語')],
                ['en', 'English'],
              ] as const
            ).map(([v, l]) => (
              <button key={v} aria-pressed={s.uiLang === v} onClick={() => update({ uiLang: v })}>
                {l}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <div className="label">{t('配色')}</div>
          <div className="row wrap">
            {THEMES.map((th) => (
              <button
                key={th.id}
                className={`btn small bg-${th.id}`}
                aria-pressed={s.theme === th.id}
                style={{ background: th.bg, color: th.fg, borderColor: s.theme === th.id ? 'var(--accent)' : 'var(--line)', borderWidth: 2 }}
                onClick={() => update({ theme: th.id })}
              >
                {t(th.label)}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <div className="label">{t('視線のガイド')}</div>
          <div className="segmented" role="group">
            {(
              [
                ['none', t('なし')],
                ['center', t('中央の目印')],
                ['focus', t('注視点を強調')],
              ] as const
            ).map(([v, l]) => (
              <button key={v} aria-pressed={s.guide === v} onClick={() => update({ guide: v })}>
                {l}
              </button>
            ))}
          </div>
        </div>

        <div className="row wrap">
          <div className="field grow">
            <div className="label">{t('文字の向き')}</div>
            <div className="segmented" role="group">
              <button aria-pressed={s.direction === 'horizontal'} onClick={() => update({ direction: 'horizontal' })}>
                {t('横')}
              </button>
              <button aria-pressed={s.direction === 'vertical'} onClick={() => update({ direction: 'vertical' })}>
                {t('縦')}
              </button>
            </div>
          </div>
          <div className="field grow">
            <div className="label">{t('書体')}</div>
            <div className="segmented" role="group">
              <button aria-pressed={s.font === 'mincho'} onClick={() => update({ font: 'mincho' })}>
                {t('明朝')}
              </button>
              <button aria-pressed={s.font === 'gothic'} onClick={() => update({ font: 'gothic' })}>
                {t('ゴシック')}
              </button>
            </div>
          </div>
        </div>

        <label className="switch">
          <span>{t('句読点・段落末で間をとる')}</span>
          <input type="checkbox" checked={s.pauses} onChange={(e) => update({ pauses: e.target.checked })} />
        </label>
        <button className="btn" onClick={() => go('/settings')}>
          {t('詳細設定を開く')}
        </button>
      </div>
    </>
  )
}

/** 欧文の本の速度（語/分）の設定 */
function WpmField() {
  const [s, update] = useSettings()
  const [custom, setCustom] = useState(String(s.wpm))
  // 設定が外から変わったら入力欄も合わせる（描画中に前回の値と比べる）
  const [shown, setShown] = useState(s.wpm)
  if (shown !== s.wpm) {
    setShown(s.wpm)
    setCustom(String(s.wpm))
  }
  return (
    <div className="field">
      <div className="label">
        <span>{t('速度（英語など）')}</span>
        <span>{t('{n} WPM（語/分）', { n: s.wpm })}</span>
      </div>
      <div className="segmented" role="group" aria-label={t('速度のプリセット（語/分）')}>
        {WPM_PRESETS.map((p) => (
          <button key={p.wpm} aria-pressed={s.wpm === p.wpm} onClick={() => update({ wpm: p.wpm })}>
            {t(p.label)}
            <span className="small muted"> {p.wpm}</span>
          </button>
        ))}
      </div>
      <input type="range" min={WPM_MIN} max={800} step={10} value={Math.min(800, s.wpm)} onChange={(e) => update({ wpm: Number(e.target.value) })} aria-label={t('速度（語/分）')} />
      <div className="row">
        <span className="small muted">{t('数値で指定')}</span>
        <input
          type="number"
          inputMode="numeric"
          min={WPM_MIN}
          max={WPM_MAX}
          value={custom}
          style={{ maxWidth: 120 }}
          onChange={(e) => setCustom(e.target.value)}
          onBlur={() => {
            const v = Number(custom)
            if (Number.isFinite(v) && v > 0) update({ wpm: Math.max(WPM_MIN, Math.min(WPM_MAX, Math.round(v))) })
            else setCustom(String(s.wpm))
          }}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          aria-label={t('速度を語/分で入力')}
        />
        <span className="small muted">
          {t('WPM（{min}〜{max}）', { min: WPM_MIN, max: WPM_MAX })}
        </span>
      </div>
    </div>
  )
}

/** 文節（BudouX）の数。参考 WPM の換算に使う */
function segmentLikeWords(s: string): number {
  const one = { paragraphs: [{ text: s, ruby: [], pageMarks: [[0, 0]] as [number, number][], globalStart: 0 }], totalChars: s.length, pageCount: 1 }
  return segmentBook(one, { mode: 'bunsetsu', phraseTarget: 8 }).length
}

function TocSheet(props: { book: LoadedBook; currentPage: number; onClose: () => void; onJump: (page: number) => void; onJumpPercent: (pct: number) => void }) {
  const { book } = props
  const isPdf = book.meta.kind !== 'text'
  const [outline, setOutline] = useState<TocEntry[] | null>(book.meta.toc ?? null)
  const [marks, setMarks] = useState<Bookmark[]>([])
  const [pageInput, setPageInput] = useState(String(props.currentPage + 1))
  useEffect(() => {
    let alive = true
    ;(async () => {
      listBookmarks(book.meta.id).then((m) => alive && setMarks(m))
      if (book.meta.toc) return
      try {
        const blob = await getFile(book.meta.id)
        if (!blob) return alive && setOutline([])
        const doc = await openPdf(await blob.arrayBuffer())
        const o = await readOutline(doc)
        await closePdf(doc)
        if (alive) setOutline(o)
      } catch {
        if (alive) setOutline([])
      }
    })()
    return () => {
      alive = false
    }
  }, [book.meta.id, book.meta.toc])
  return (
    <>
      <div className="sheet-backdrop" onClick={props.onClose} />
      <div className="sheet stack" role="dialog" aria-label={t('目次とページ移動')}>
        <div className="row">
          <div className="grow" style={{ fontWeight: 700, fontSize: 17 }}>
            {t('目次・ページ移動')}
          </div>
          <button className="icon-btn" aria-label={t('閉じる')} onClick={props.onClose}>
            <Icon name="close" />
          </button>
        </div>
        <div className="row" hidden={!isPdf}>
          <span className="small muted">{t('ページ')}</span>
          <input type="number" inputMode="numeric" min={1} max={book.meta.pageCount} value={pageInput} onChange={(e) => setPageInput(e.target.value)} style={{ maxWidth: 100 }} aria-label={t('移動先のページ')} />
          <span className="small muted">/ {book.meta.pageCount}</span>
          <button
            className="btn small primary"
            onClick={() => {
              const n = Number(pageInput)
              if (n >= 1 && n <= book.meta.pageCount) props.onJump(n - 1)
            }}
          >
            {t('移動')}
          </button>
        </div>
        <div className="row wrap">
          {[0, 25, 50, 75].map((p) => (
            <button key={p} className="btn small" onClick={() => props.onJumpPercent(p)}>
              {p}%
            </button>
          ))}
        </div>
        {marks.length > 0 && (
          <div>
            <div className="section-title" style={{ marginTop: 8 }}>
              {t('しおり')}
            </div>
            <ul className="list">
              {marks.map((m) => (
                <li key={m.id}>
                  <button onClick={() => props.onJump(m.page)}>
                    <Icon name="bookmark" className="icon" />
                    <span className="grow">{m.label}</span>
                    <span className="small muted">p.{m.page + 1}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div>
          <div className="section-title" style={{ marginTop: 8 }}>
            {t('目次')}
          </div>
          {outline === null ? (
            <p className="small muted">{t('読み込み中…')}</p>
          ) : outline.length === 0 ? (
            <p className="small muted">{isPdf ? t('このPDFには目次（しおり）が入っていません。ページ番号で移動してください。') : t('このテキストには見出しがありません。割合で移動してください。')}</p>
          ) : (
            <ul className="list">
              {outline.map((o, i) => (
                <li key={i}>
                  <button onClick={() => props.onJump(o.page)} style={{ paddingLeft: 4 + o.depth * 16 }}>
                    <span className="grow">{o.title}</span>
                    <span className="small muted">p.{o.page + 1}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  )
}

function PeopleSheet(props: { book: LoadedBook; people: Person[]; onChange: (p: Person[]) => void; onClose: () => void }) {
  const [s, update] = useSettings()
  const { people, onChange } = props
  const candidates = useMemo(() => suggestPeople(props.book.text, people), [props.book.text, people])
  const [newName, setNewName] = useState('')
  const add = (name: string) => {
    const n = name.trim()
    if (!n || people.some((p) => p.name === n)) return
    onChange([...people, { id: newId(), name: n, aliases: [], color: PERSON_COLORS[people.length % PERSON_COLORS.length], label: '' }])
    setNewName('')
  }
  const patch = (id: string, f: (p: Person) => Person) => onChange(people.map((p) => (p.id === id ? f(p) : p)))
  return (
    <>
      <div className="sheet-backdrop" onClick={props.onClose} />
      <div className="sheet stack" role="dialog" aria-label={t('人物')}>
        <div className="row">
          <div className="grow" style={{ fontWeight: 700, fontSize: 17 }}>
            {t('人物')}
          </div>
          <button className="icon-btn" aria-label={t('閉じる')} onClick={props.onClose}>
            <Icon name="close" />
          </button>
        </div>
        <p className="small muted" style={{ margin: 0 }}>
          {t('登録した名前は本文中で色分けし、途中で区切らずに表示します。説明は名前の下に小さく出します。')}
        </p>
        <label className="switch">
          <span>{t('名前を色分け')}</span>
          <input type="checkbox" checked={s.personColors} onChange={(e) => update({ personColors: e.target.checked })} />
        </label>
        <label className="switch">
          <span>{t('名前を含む単位を少し長く表示')}</span>
          <input type="checkbox" checked={s.nameBoost} onChange={(e) => update({ nameBoost: e.target.checked })} />
        </label>
        <div className="field">
          <div className="label">{t('説明を出すとき')}</div>
          <div className="segmented" role="group">
            {(
              [
                ['off', t('出さない')],
                ['chapter3', t('章の最初3回')],
                ['first3', t('本の最初3回')],
                ['always', t('毎回')],
              ] as const
            ).map(([v, l]) => (
              <button key={v} aria-pressed={s.personLabel === v} onClick={() => update({ personLabel: v })}>
                {l}
              </button>
            ))}
          </div>
        </div>

        {people.map((p) => (
          <div key={p.id} className="card stack" style={{ padding: 12 }}>
            <div className="row">
              <input type="text" value={p.name} aria-label={t('名前')} onChange={(e) => patch(p.id, (x) => ({ ...x, name: e.target.value }))} style={{ color: p.color, fontWeight: 700 }} />
              <button className="icon-btn" aria-label={t('{name}を削除', { name: p.name })} onClick={() => onChange(people.filter((x) => x.id !== p.id))}>
                <Icon name="trash" />
              </button>
            </div>
            <input type="text" placeholder={t('説明（例：主人公の幼なじみ）')} value={p.label} aria-label={t('説明')} onChange={(e) => patch(p.id, (x) => ({ ...x, label: e.target.value }))} />
            <input
              type="text"
              placeholder={t('別名（読点区切り。例：千ちゃん、千晴さん）')}
              value={p.aliases.join(t('、'))}
              aria-label={t('別名')}
              onChange={(e) => patch(p.id, (x) => ({ ...x, aliases: e.target.value.split(/[、,，]/).map((t) => t.trim()).filter(Boolean) }))} // i18n-ignore: 別名の区切り文字（入力の分割。画面の文言ではない）
            />
            <div className="row wrap" role="group" aria-label={t('色')}>
              {PERSON_COLORS.map((c) => (
                <button key={c} className="swatch" aria-label={t('色 {color}', { color: c })} aria-pressed={p.color === c} style={{ background: c }} onClick={() => patch(p.id, (x) => ({ ...x, color: c }))} />
              ))}
            </div>
          </div>
        ))}

        <div className="row">
          <input type="text" placeholder={t('名前を追加')} value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add(newName)} aria-label={t('追加する名前')} />
          <button className="btn small primary" onClick={() => add(newName)} disabled={!newName.trim()}>
            {t('追加')}
          </button>
        </div>

        {candidates.length > 0 && (
          <div>
            <div className="section-title" style={{ marginTop: 4 }}>
              {t('候補（本文から自動で拾った語。人名でないものも含みます）')}
            </div>
            <div className="row wrap">
              {candidates.map((c) => (
                <button key={c.word} className="btn small" title={t('{reason}・{count}回', { reason: t(c.reason), count: c.count })} onClick={() => add(c.word)}>
                  {'\uFF0B'}{c.word}
                  <span className="small muted">{c.count}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  )
}
