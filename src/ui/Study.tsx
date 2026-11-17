// 「英語」のタブ。
//   本棚（#/study）    ：文章を撮る・貼る・ファイルで取り込み、AI が解析して教材にする。教材を並べる
//   教材（#/m/:id）    ：文ごとに S・V・O・C の印・訳・文法・難しめの単語。流して読む・音読・画像で保存
//   文法（#/grammar/:g）：その文法が出てくる文を、全部の教材から集める

import { useEffect, useMemo, useRef, useState } from 'react'
import { t } from '../lib/i18n'
import { GRAMMAR, MODELS, addVocab, vocabId, type Analysis, type Direction, type Grammar, type Sentence, type StudyModel } from '../lib/study'
import {
  createMaterial,
  getApiKey,
  getModel,
  getSpend,
  loadAnalyses,
  loadMaterials,
  lookupWord,
  readFileText,
  saveMaterials,
  setApiKey,
  setModel,
} from '../lib/studyAi'
import { dueItems, folders, grammarCounts, recordReading, sentencesOf, updateMaterial, vocabProgress, type Material } from '../lib/studyTools'
import { ConfirmDialog, formatDate, go, Icon, toast } from './common'
import { FlowView, ReadAloudSheet, shareSentence } from './StudyFlow'
import { Legend, SentenceCard, WordSheet, errorText, useVocab, type SentenceActions } from './StudyParts'

/** 上限なく貼れる長さ（これを超える分は AI に何回かに分けて送る） */
const MAX_PASTE = 20000

export function useMaterials(): [Material[] | null, (next: Material[]) => void] {
  const [list, setList] = useState<Material[] | null>(null)
  useEffect(() => {
    loadMaterials()
      .then(setList)
      .catch(() => setList([]))
  }, [])
  const save = (next: Material[]) => {
    setList(next)
    saveMaterials(next).catch(() => toast(t('保存できませんでした')))
  }
  return [list, save]
}

function AiSettings() {
  const [key, setKey] = useState(getApiKey())
  const [model, setM] = useState<StudyModel>(getModel())
  const has = !!getApiKey()
  return (
    <details className="card study-settings" open={!has}>
      <summary>{t('AI の設定')}</summary>
      <div className="stack" style={{ marginTop: 10 }}>
        <label className="field">
          <div className="label">{t('Anthropic の API キー')}</div>
          <input type="password" autoComplete="off" value={key} placeholder="sk-ant-..." onChange={(e) => setKey(e.target.value)} />
        </label>
        <div className="row wrap">
          <button
            className="btn small primary"
            onClick={() => {
              setApiKey(key)
              toast(key.trim() ? t('保存しました') : t('API キーを消しました'))
            }}
          >
            {t('保存')}
          </button>
          {has && (
            <button
              className="btn small danger"
              onClick={() => {
                setApiKey('')
                setKey('')
                toast(t('API キーを消しました'))
              }}
            >
              {t('消す')}
            </button>
          )}
        </div>
        <p className="small muted" style={{ margin: 0 }}>
          {t('キーはこのブラウザの中にだけ保存し、本のデータの書き出しには含めません。文は解析のときだけ Anthropic に送られます。料金はキーの持ち主の Anthropic アカウントにかかります。')}
        </p>
        <div className="field">
          <div className="label">{t('AI のモデル')}</div>
          <div className="segmented" role="group">
            {(Object.keys(MODELS) as StudyModel[]).map((m) => (
              <button
                key={m}
                aria-pressed={model === m}
                onClick={() => {
                  setModel(m)
                  setM(m)
                }}
              >
                {MODELS[m].label}
              </button>
            ))}
          </div>
        </div>
        <p className="small muted" style={{ margin: 0 }}>
          {t('Opus は高性能で、Haiku は料金がおよそ40分の1です。これまでに使った料金の目安: {usd}ドル', { usd: getSpend().toFixed(3) })}
        </p>
      </div>
    </details>
  )
}

function modeLabel(d: Direction): string {
  return d === 'en-ja' ? t('英語 → 日本語') : d === 'ja-en' ? t('日本語 → 英語') : t('英作文の添削')
}

/** 本棚：取り込みと教材の一覧 */
export function Study() {
  const [direction, setDirection] = useState<Direction>('en-ja')
  const [text, setText] = useState('')
  const [folder, setFolder] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [materials] = useMaterials()
  const [vocab] = useVocab()
  const [shelf, setShelf] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const photoRef = useRef<HTMLInputElement>(null)

  const run = async () => {
    setErr(null)
    setBusy(t('解析中…'))
    try {
      const m = await createMaterial(direction, text, {
        folder,
        onProgress: (done, total) => total > 1 && setBusy(t('解析中… {done} / {total}', { done: Math.min(done + 1, total), total })),
      })
      setText('')
      go(`/m/${m.id}`)
    } catch (e) {
      setErr(errorText(e))
    } finally {
      setBusy(null)
    }
  }

  const readFile = async (file: File | undefined) => {
    if (!file) return
    setErr(null)
    setBusy(t('文字を読み取っています…'))
    try {
      const s = await readFileText(file, direction === 'ja-en' ? 'jpn' : 'eng', (p) => setBusy(t('文字を読み取っています… {p}%', { p: Math.round(p * 100) })))
      if (!s) setErr(t('文字が見つかりませんでした。'))
      else setText((cur) => (cur ? `${cur}\n${s}` : s).slice(0, MAX_PASTE))
    } catch {
      setErr(t('ファイルを読めませんでした。'))
    } finally {
      setBusy(null)
    }
  }

  const due = dueItems(vocab).length
  const shown = (materials ?? []).filter((m) => !shelf || m.folder === shelf).sort((a, b) => b.openedAt - a.openedAt)
  const pieces = Math.ceil(text.length / 1200)

  return (
    <div className="screen with-tabs" role="main">
      <header className="topbar" role="none">
        <h1>{t('英語')}</h1>
        <div className="grow" />
        <button className="btn small" onClick={() => go('/analysis')}>
          <Icon name="chart" />
          {t('分析')}
        </button>
        <button className="btn small" onClick={() => go('/vocab')}>
          <Icon name="bookmark" />
          {t('単語帳')}
          {due > 0 && <span className="study-badge">{due}</span>}
        </button>
      </header>

      <div className="card stack">
        <div className="segmented" role="group" aria-label={t('モード')}>
          {(['en-ja', 'ja-en', 'fix'] as Direction[]).map((d) => (
            <button key={d} aria-pressed={direction === d} onClick={() => setDirection(d)}>
              {modeLabel(d)}
            </button>
          ))}
        </div>
        <div className="row wrap">
          <button className="btn small" onClick={() => photoRef.current?.click()} disabled={!!busy}>
            <Icon name="scan" />
            {t('撮る・写真から')}
          </button>
          <button className="btn small" onClick={() => fileRef.current?.click()} disabled={!!busy}>
            <Icon name="pdf" />
            {t('ファイルから')}
          </button>
          <input ref={photoRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => readFile(e.target.files?.[0]).finally(() => (e.target.value = ''))} />
          <input ref={fileRef} type="file" accept=".txt,.pdf,text/plain,application/pdf,image/*" hidden onChange={(e) => readFile(e.target.files?.[0]).finally(() => (e.target.value = ''))} />
        </div>
        <textarea
          className="study-input"
          lang={direction === 'ja-en' ? 'ja' : 'en'}
          rows={5}
          maxLength={MAX_PASTE}
          value={text}
          placeholder={direction === 'en-ja' ? t('英文を貼り付けてください') : direction === 'ja-en' ? t('日本語の文を入れてください') : t('自分で書いた英文を入れてください')}
          aria-label={t('解析する文')}
          onChange={(e) => setText(e.target.value)}
        />
        <input type="text" value={folder} onChange={(e) => setFolder(e.target.value)} placeholder={t('フォルダ（例: 教科書 Lesson 3）')} aria-label={t('フォルダ')} list="study-folders" />
        <datalist id="study-folders">
          {folders(materials ?? []).map((f) => (
            <option key={f} value={f} />
          ))}
        </datalist>
        <div className="row">
          <span className="small muted grow">
            {text.length.toLocaleString()} {t('字')}
            {pieces > 1 && ` · ${t('{n}回に分けて解析します', { n: pieces })}`}
          </span>
          {text && (
            <button className="btn small ghost" onClick={() => setText('')}>
              {t('消す')}
            </button>
          )}
        </div>
        <button className="btn primary" disabled={!!busy || !text.trim()} onClick={run}>
          <Icon name="bolt" />
          {busy ?? (direction === 'fix' ? t('添削して教材にする') : t('解析して教材にする'))}
        </button>
        {err && <div className="notice error">{err}</div>}
      </div>

      <div className="row" style={{ marginTop: 20 }}>
        <div className="section-title grow" style={{ margin: 0 }}>
          {t('教材')} <span className="muted">{materials?.length ?? 0}</span>
        </div>
        {(materials?.length ?? 0) > 0 && (
          <button className="btn small ghost" onClick={() => go('/grammar')}>
            {t('文法で探す')}
          </button>
        )}
      </div>
      {folders(materials ?? []).length > 0 && (
        <div className="segmented" role="group" aria-label={t('フォルダ')} style={{ marginTop: 8 }}>
          <button aria-pressed={!shelf} onClick={() => setShelf('')}>
            {t('すべて')}
          </button>
          {folders(materials ?? []).map((f) => (
            <button key={f} aria-pressed={shelf === f} onClick={() => setShelf(f)}>
              {f}
            </button>
          ))}
        </div>
      )}
      {materials && materials.length === 0 && <p className="muted small">{t('まだ教材がありません。英文を撮るか貼って「解析して教材にする」を押すと、ここに並びます。')}</p>}
      <div className="stack" style={{ marginTop: 10 }}>
        {shown.map((m) => {
          const v = vocabProgress(m, vocab)
          return (
            <button key={m.id} className="card study-material" onClick={() => go(`/m/${m.id}`)}>
              <div className="row">
                {m.folder && <span className="study-chip">{m.folder}</span>}
                <span className="small muted">{modeLabel(m.direction)}</span>
                <div className="grow" />
                {m.last > 0 && m.last < m.count - 1 && <span className="study-chip study-continue">{t('続き {n}文目から', { n: m.last + 1 })}</span>}
              </div>
              <div className="study-material-title" lang="en">
                {m.title}
              </div>
              <div className="small muted">
                {t('音読 {a}/{b}', { a: m.readOk.length, b: m.count })} · {t('語彙 {a}/{b}', { a: v.have, b: v.total })} · {formatDate(m.openedAt)}
              </div>
            </button>
          )
        })}
      </div>

      <AiSettings />
    </div>
  )
}

/** 教材の画面で使う、練習のシートと単語のシートをまとめた状態 */
function useSentenceActions(vocab: ReturnType<typeof useVocab>[0], saveVocab: ReturnType<typeof useVocab>[1], onTouch: (s: Sentence) => void) {
  const [word, setWord] = useState<{ word: string; sentence: string } | null>(null)
  const [flow, setFlow] = useState<Sentence[] | null>(null)
  const [reading, setReading] = useState<Sentence | null>(null)
  const [adding, setAdding] = useState<string | null>(null)
  const actions: SentenceActions = {
    onWord: (w, sentence) => setWord({ word: w, sentence }),
    onFlow: (s) => {
      onTouch(s)
      setFlow([s])
    },
    onReadAloud: (s) => {
      onTouch(s)
      setReading(s)
    },
    onShare: (s) => shareSentence(s).catch(() => toast(t('画像を作れませんでした'))),
    onAddHard: async (s) => {
      let list = vocab
      const todo = s.hard.filter((h) => !list.some((v) => v.id === vocabId(h.word) || v.entry.word.toLowerCase() === h.word.toLowerCase()))
      if (!todo.length) return toast(t('すべて単語帳に入っています'))
      try {
        for (let i = 0; i < todo.length; i++) {
          setAdding(t('単語帳に入れています… {done} / {total}', { done: i + 1, total: todo.length }))
          list = addVocab(list, await lookupWord(todo[i].word, s.en), s.en)
        }
        saveVocab(list)
        toast(t('{n}語を単語帳に入れました', { n: todo.length }))
      } catch (e) {
        saveVocab(list)
        toast(errorText(e))
      } finally {
        setAdding(null)
      }
    },
  }
  return { actions, word, setWord, flow, setFlow, reading, setReading, adding }
}

/** 教材の画面 */
export function MaterialView({ id }: { id: string }) {
  const [materials, saveList] = useMaterials()
  const [analyses, setAnalyses] = useState<Analysis[] | null>(null)
  const [vocab, saveVocab] = useVocab()
  const [renaming, setRenaming] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const m = materials?.find((x) => x.id === id)
  const sentences = useMemo(() => sentencesOf(analyses ?? []), [analyses])
  const indexOf = (s: Sentence) => sentences.indexOf(s)
  const opened = useRef(false)

  useEffect(() => {
    if (!m || !materials || opened.current) return
    opened.current = true
    loadAnalyses(m).then((a) => {
      setAnalyses(a)
      // 続きの文まで送る（最初に表示したときだけ）
      if (m.last) requestAnimationFrame(() => document.getElementById(`s${m.last}`)?.scrollIntoView({ block: 'center' }))
    })
    // 開いた時刻を本棚の並び順に使う
    saveList(updateMaterial(materials, id, (x) => ({ ...x, openedAt: Date.now() })))
  }, [m, materials, id, saveList])

  const touch = (s: Sentence) => {
    if (!materials) return
    const i = indexOf(s)
    if (i >= 0) saveList(updateMaterial(materials, id, (x) => ({ ...x, last: i })))
  }
  const sa = useSentenceActions(vocab, saveVocab, touch)

  if (materials && !m)
    return (
      <div className="screen" role="main">
        <header className="topbar" role="none">
          <button className="icon-btn" aria-label={t('戻る')} onClick={() => go('/study')}>
            <Icon name="back" />
          </button>
        </header>
        <div className="notice error">{t('この教材は見つかりませんでした。')}</div>
      </div>
    )
  if (!m || !analyses) return <div className="screen" role="main" />

  const v = vocabProgress(m, vocab)
  return (
    <div className="screen" role="main">
      <header className="topbar" role="none">
        <button className="icon-btn" aria-label={t('戻る')} onClick={() => (history.length > 1 ? history.back() : go('/study'))}>
          <Icon name="back" />
        </button>
        <div className="grow" />
        <button className="icon-btn" aria-label={t('名前とフォルダを変える')} onClick={() => setRenaming((r) => !r)}>
          <Icon name="text" />
        </button>
        <button className="icon-btn" aria-label={t('教材を削除')} onClick={() => setConfirmDelete(true)}>
          <Icon name="trash" />
        </button>
      </header>
      {renaming ? (
        <div className="card stack">
          <label className="field">
            <div className="label">{t('名前')}</div>
            <input type="text" defaultValue={m.title} id="m-title" />
          </label>
          <label className="field">
            <div className="label">{t('フォルダ')}</div>
            <input type="text" defaultValue={m.folder} id="m-folder" />
          </label>
          <button
            className="btn small primary"
            onClick={() => {
              const title = (document.getElementById('m-title') as HTMLInputElement).value.trim() || m.title
              const folder = (document.getElementById('m-folder') as HTMLInputElement).value.trim()
              saveList(updateMaterial(materials!, id, (x) => ({ ...x, title, folder })))
              setRenaming(false)
            }}
          >
            {t('保存')}
          </button>
        </div>
      ) : (
        <>
          <h1 className="study-material-head" lang="en">
            {m.title}
          </h1>
          <div className="small muted">
            {m.folder && `${m.folder} · `}
            {t('音読 {a}/{b}', { a: m.readOk.length, b: m.count })} · {t('語彙 {a}/{b}', { a: v.have, b: v.total })}
          </div>
        </>
      )}
      <div className="row wrap" style={{ margin: '12px 0' }}>
        <button className="btn primary" onClick={() => go(`/quiz/${id}`)}>
          <Icon name="quiz" />
          {t('問題を解く')}
        </button>
        <button className="btn" onClick={() => sa.setFlow(sentences.slice(m.last < sentences.length - 1 ? m.last : 0))}>
          <Icon name="bolt" />
          {m.last > 0 && m.last < sentences.length - 1 ? t('続き {n}文目から流して読む', { n: m.last + 1 }) : t('全体を流して読む')}
        </button>
      </div>
      <Legend />
      {sa.adding && <div className="notice">{sa.adding}</div>}
      <div className="stack" style={{ marginTop: 10 }}>
        {sentences.map((s, i) => (
          <div key={i} id={`s${i}`} className={m.readOk.includes(i) ? 'study-read-ok' : ''}>
            <div className="small muted study-num">
              {i + 1}
              {m.readOk.includes(i) && ` · ${t('音読済み')}`}
            </div>
            <SentenceCard s={s} direction={m.direction} actions={sa.actions} />
          </div>
        ))}
      </div>
      <p className="small muted">{t('英文の単語を押すと、意味・類義語・例文を出して単語帳に入れられます。AI の解析は間違えることがあります。')}</p>

      {sa.word && <WordSheet word={sa.word.word} sentence={sa.word.sentence} vocab={vocab} onSave={saveVocab} onClose={() => sa.setWord(null)} />}
      {sa.flow && <FlowView sentences={sa.flow} onClose={() => sa.setFlow(null)} />}
      {sa.reading && (
        <ReadAloudSheet
          sentence={sa.reading}
          onClose={() => sa.setReading(null)}
          onScore={(score) => {
            const i = indexOf(sa.reading!)
            if (i >= 0) saveList(updateMaterial(materials!, id, (x) => recordReading(x, i, score)))
          }}
        />
      )}
      {confirmDelete && (
        <ConfirmDialog
          title={t('教材を削除しますか？')}
          body={t('単語帳に入れた単語は残ります。')}
          confirmLabel={t('削除')}
          danger
          onCancel={() => setConfirmDelete(false)}
          onConfirm={() => {
            saveList(materials!.filter((x) => x.id !== id))
            go('/study')
          }}
        />
      )}
    </div>
  )
}

/** 文法ごとに、全部の教材から文を集める */
export function GrammarView({ grammar }: { grammar?: string }) {
  const [materials] = useMaterials()
  const [vocab, saveVocab] = useVocab()
  const [items, setItems] = useState<{ m: Material; s: Sentence }[] | null>(null)
  const g = GRAMMAR.includes(grammar as Grammar) ? (grammar as Grammar) : null
  const sa = useSentenceActions(vocab, saveVocab, () => undefined)

  useEffect(() => {
    if (!materials || !g) return
    ;(async () => {
      const out: { m: Material; s: Sentence }[] = []
      for (const m of materials.filter((x) => x.grammar.includes(g))) for (const s of sentencesOf(await loadAnalyses(m))) if (s.grammar.includes(g)) out.push({ m, s })
      setItems(out)
    })()
  }, [materials, g])

  return (
    <div className="screen" role="main">
      <header className="topbar" role="none">
        <button className="icon-btn" aria-label={t('戻る')} onClick={() => (history.length > 1 ? history.back() : go('/study'))}>
          <Icon name="back" />
        </button>
        <h1>{g ?? t('文法で探す')}</h1>
      </header>
      {!g ? (
        <div className="stack">
          {grammarCounts(materials ?? []).map(({ grammar: x, count }) => (
            <button key={x} className="card row study-material" onClick={() => go(`/grammar/${encodeURIComponent(x)}`)}>
              <span className="grow">{x}</span>
              <span className="muted small">{t('{n}本の教材', { n: count })}</span>
              <Icon name="chevron" />
            </button>
          ))}
          {materials && !materials.length && <p className="muted">{t('まだ教材がありません。')}</p>}
        </div>
      ) : (
        <div className="stack">
          {items?.length === 0 && <p className="muted">{t('見つかりませんでした。')}</p>}
          {items?.map(({ m, s }, i) => (
            <div key={i}>
              <button className="small muted study-link" onClick={() => go(`/m/${m.id}`)}>
                {m.title}
              </button>
              <SentenceCard s={s} direction={m.direction} actions={sa.actions} />
            </div>
          ))}
        </div>
      )}
      {sa.word && <WordSheet word={sa.word.word} sentence={sa.word.sentence} vocab={vocab} onSave={saveVocab} onClose={() => sa.setWord(null)} />}
      {sa.flow && <FlowView sentences={sa.flow} onClose={() => sa.setFlow(null)} />}
      {sa.reading && <ReadAloudSheet sentence={sa.reading} onClose={() => sa.setReading(null)} />}
    </div>
  )
}
