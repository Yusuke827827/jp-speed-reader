// 「英語」のタブ。日本語→自然な英語、英語→日本語に訳し、英文に S・V・O・C・M の印を付ける。
// 英文の単語を押すと、文の中での意味・ほかの訳・類義語・例文を出し、単語帳に入れられる。

import { useEffect, useMemo, useState } from 'react'
import { getKV, setKV } from '../lib/db'
import { t } from '../lib/i18n'
import { speechAvailable, unlockSpeech, voicesFor } from '../lib/speech'
import {
  MAX_INPUT,
  MODELS,
  addVocab,
  removeVocab,
  searchVocab,
  toggleLearned,
  tokenize,
  type Analysis,
  type Direction,
  type Part,
  type Role,
  type Sentence,
  type StudyModel,
  type VocabItem,
  type WordEntry,
} from '../lib/study'
import { StudyError, analyze, getApiKey, getModel, getSpend, lookupWord, setApiKey, setModel } from '../lib/studyAi'
import { go, Icon, toast } from './common'

const VOCAB_KEY = 'vocab'
const LAST_KEY = 'study:last'

function roleName(r: Role): string {
  switch (r) {
    case 'S':
      return t('主語')
    case 'V':
      return t('動詞')
    case 'O':
      return t('目的語')
    case 'C':
      return t('補語')
    case 'M':
      return t('修飾語')
    default:
      return ''
  }
}

export function errorText(e: unknown): string {
  const kind = e instanceof StudyError ? e.kind : 'other'
  switch (kind) {
    case 'no-key':
      return t('AI を使うには、下の「AI の設定」で API キーを入れてください。')
    case 'auth':
      return t('API キーが正しくないか、使えない状態です。')
    case 'rate':
      return t('混み合っています。少し待ってからもう一度試してください。')
    case 'network':
      return t('通信できませんでした。インターネットにつながっているか確かめてください。')
    case 'refusal':
      return t('この文は AI が扱えませんでした。')
    case 'too-long':
      return t('文が長すぎます。{n}字以内に分けてください。', { n: MAX_INPUT })
    case 'bad-json':
      return t('AI の返事を読み取れませんでした。もう一度試してください。')
    default:
      return t('うまくいきませんでした。もう一度試してください。')
  }
}

export function useVocab(): [VocabItem[], (next: VocabItem[]) => void] {
  const [list, setList] = useState<VocabItem[]>([])
  useEffect(() => {
    getKV<VocabItem[]>(VOCAB_KEY)
      .then((v) => setList(v ?? []))
      .catch(() => setList([]))
  }, [])
  const save = (next: VocabItem[]) => {
    setList(next)
    setKV(VOCAB_KEY, next).catch(() => toast(t('保存できませんでした')))
  }
  return [list, save]
}

function speak(text: string) {
  if (!speechAvailable()) return
  unlockSpeech()
  const u = new SpeechSynthesisUtterance(text)
  u.lang = 'en-US'
  const v = voicesFor('en')[0]
  if (v) u.voice = v
  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(u)
}

/** 押せる単語を並べる */
function Words({ text, onWord }: { text: string; onWord: (w: string) => void }) {
  return (
    <>
      {tokenize(text).map((tk, i) =>
        tk.word ? (
          <button key={i} className="study-word" onClick={() => onWord(tk.text)}>
            {tk.text}
          </button>
        ) : (
          <span key={i}>{tk.text}</span>
        ),
      )}
    </>
  )
}

function PartView({ part, onWord }: { part: Part; onWord: (w: string) => void }) {
  const label = part.role === 'X' ? '' : part.role
  return (
    <span className={`study-part role-${part.role}`} title={roleName(part.role)}>
      <span className="study-part-text">
        {part.inner.length ? (
          <>
            {part.inner.map((x, i) => (
              <span key={i} className={`study-inner role-${x.role}`}>
                <span className="study-part-text">
                  <Words text={x.text} onWord={onWord} />
                </span>
                <span className="study-label">{x.role === 'X' ? '' : x.role.toLowerCase()}</span>
              </span>
            ))}
          </>
        ) : (
          <Words text={part.text} onWord={onWord} />
        )}
      </span>
      <span className="study-label">
        {label}
        {part.note && <span className="study-note">{part.note}</span>}
      </span>
    </span>
  )
}

function SentenceCard({ s, direction, onWord }: { s: Sentence; direction: Direction; onWord: (w: string, sentence: string) => void }) {
  return (
    <div className="card stack study-sentence">
      <div className="row">
        <span className="study-pattern">{s.pattern === 'other' ? t('その他') : s.pattern}</span>
        <div className="grow" />
        {speechAvailable() && (
          <button className="icon-btn" aria-label={t('英文を読み上げる')} onClick={() => speak(s.en)}>
            <Icon name="play" />
          </button>
        )}
      </div>
      <div className="study-parts" lang="en">
        {s.parts.map((p, i) => (
          <PartView key={i} part={p} onWord={(w) => onWord(w, s.en)} />
        ))}
      </div>
      {!s.checked && <div className="notice warn small">{t('AI の区切りが元の文と一致しません。印は参考にしてください。')}</div>}
      <div className="study-ja">{s.ja}</div>
      {s.explanation && <div className="small muted">{s.explanation}</div>}
      {s.alt.length > 0 && (
        <div className="small">
          <div className="muted">{direction === 'ja-en' ? t('別の言い方') : t('別の訳')}</div>
          <ul className="study-alt">
            {s.alt.map((a, i) => (
              <li key={i} lang={direction === 'ja-en' ? 'en' : 'ja'}>
                {a}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function Legend() {
  return (
    <div className="study-legend small" aria-label={t('印の見方')}>
      {(['S', 'V', 'O', 'C', 'M'] as Role[]).map((r) => (
        <span key={r} className={`study-chip role-${r}`}>
          {r} {roleName(r)}
        </span>
      ))}
      <span className="muted">{t('小文字は節の中の要素')}</span>
    </div>
  )
}

/** 単語の説明（下から出るシート） */
export function WordSheet(props: { word: string; sentence: string; onClose: () => void; vocab: VocabItem[]; onSave: (list: VocabItem[]) => void }) {
  const [entry, setEntry] = useState<WordEntry | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    lookupWord(props.word, props.sentence)
      .then(setEntry)
      .catch((e) => setErr(errorText(e)))
  }, [props.word, props.sentence])
  const saved = entry && props.vocab.some((v) => v.id === entry.lemma.trim().toLowerCase())
  return (
    <>
      <div className="sheet-backdrop" onClick={props.onClose} />
      <div className="sheet stack" role="dialog" aria-label={t('単語の説明')}>
        <div className="row">
          <div className="grow" lang="en" style={{ fontWeight: 700, fontSize: 20 }}>
            {entry?.lemma ?? props.word}
            {entry?.ipa && <span className="muted small"> {entry.ipa}</span>}
          </div>
          {speechAvailable() && (
            <button className="icon-btn" aria-label={t('発音を聞く')} onClick={() => speak(entry?.lemma ?? props.word)}>
              <Icon name="play" />
            </button>
          )}
          <button className="icon-btn" aria-label={t('閉じる')} onClick={props.onClose}>
            <Icon name="close" />
          </button>
        </div>
        {err && <div className="notice error">{err}</div>}
        {!entry && !err && <div className="muted">{t('調べています…')}</div>}
        {entry && <WordBody entry={entry} />}
        {entry && (
          <button
            className={`btn ${saved ? '' : 'primary'}`}
            onClick={() => {
              props.onSave(addVocab(props.vocab, entry, props.sentence))
              toast(saved ? t('単語帳の説明を新しくしました') : t('単語帳に入れました'))
            }}
          >
            <Icon name="bookmark" />
            {saved ? t('単語帳の説明を新しくする') : t('単語帳に入れる')}
          </button>
        )}
      </div>
    </>
  )
}

function WordBody({ entry }: { entry: WordEntry }) {
  return (
    <div className="stack study-entry">
      <div>
        <div className="small muted">{t('この文での意味')}</div>
        <div style={{ fontSize: 18, fontWeight: 600 }}>{entry.sense}</div>
      </div>
      {entry.meanings.length > 0 && (
        <div>
          <div className="small muted">{t('ほかの訳')}</div>
          <ul className="study-list">
            {entry.meanings.map((m, i) => (
              <li key={i}>
                <span className="study-pos">{m.pos}</span> {m.ja}
              </li>
            ))}
          </ul>
        </div>
      )}
      {entry.synonyms.length > 0 && (
        <div>
          <div className="small muted">{t('類義語')}</div>
          <ul className="study-list">
            {entry.synonyms.map((s, i) => (
              <li key={i}>
                <b lang="en">{s.word}</b> {s.ja}
                {s.nuance && <div className="small muted">{s.nuance}</div>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {entry.examples.length > 0 && (
        <div>
          <div className="small muted">{t('例文')}</div>
          <ul className="study-list">
            {entry.examples.map((x, i) => (
              <li key={i}>
                <div lang="en">{x.en}</div>
                <div className="small muted">{x.ja}</div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
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

export function Study() {
  const [direction, setDirection] = useState<Direction>('en-ja')
  const [text, setText] = useState('')
  const [result, setResult] = useState<Analysis | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [word, setWord] = useState<{ word: string; sentence: string } | null>(null)
  const [vocab, saveVocab] = useVocab()

  // 前回の結果を出しておく
  useEffect(() => {
    getKV<Analysis>(LAST_KEY)
      .then((a) => {
        if (!a) return
        setResult(a)
        setDirection(a.direction)
        setText(a.source)
      })
      .catch(() => undefined)
  }, [])

  const run = async () => {
    setBusy(true)
    setErr(null)
    try {
      const a = await analyze(direction, text)
      setResult(a)
      setKV(LAST_KEY, a).catch(() => undefined)
    } catch (e) {
      setErr(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  const unlearned = useMemo(() => vocab.filter((v) => !v.learned).length, [vocab])

  return (
    <div className="screen with-tabs" role="main">
      <header className="topbar" role="none">
        <h1>{t('英語')}</h1>
        <div className="grow" />
        <button className="btn small" onClick={() => go('/vocab')}>
          <Icon name="bookmark" />
          {t('単語帳')} {vocab.length > 0 && <span className="muted">{unlearned}</span>}
        </button>
      </header>

      <div className="segmented" role="group" aria-label={t('訳す向き')}>
        <button aria-pressed={direction === 'en-ja'} onClick={() => setDirection('en-ja')}>
          {t('英語 → 日本語')}
        </button>
        <button aria-pressed={direction === 'ja-en'} onClick={() => setDirection('ja-en')}>
          {t('日本語 → 英語')}
        </button>
      </div>

      <textarea
        className="study-input"
        lang={direction === 'en-ja' ? 'en' : 'ja'}
        rows={4}
        maxLength={MAX_INPUT}
        value={text}
        placeholder={direction === 'en-ja' ? t('英文を貼り付けてください') : t('日本語の文を入れてください')}
        aria-label={t('解析する文')}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="row">
        <span className="small muted grow">
          {text.length} / {MAX_INPUT}
        </span>
        {text && (
          <button className="btn small ghost" onClick={() => setText('')}>
            {t('消す')}
          </button>
        )}
        <button className="btn primary" disabled={busy || !text.trim()} onClick={run}>
          <Icon name="bolt" />
          {busy ? t('解析中…') : direction === 'en-ja' ? t('訳して構造を見る') : t('英語にして構造を見る')}
        </button>
      </div>

      {err && <div className="notice error">{err}</div>}

      {result && (
        <div className="stack">
          <Legend />
          {result.sentences.map((s, i) => (
            <SentenceCard key={i} s={s} direction={result.direction} onWord={(w, sentence) => setWord({ word: w, sentence })} />
          ))}
          <p className="small muted" style={{ margin: 0 }}>
            {t('英文の単語を押すと、意味・類義語・例文を出して単語帳に入れられます。AI の解析は間違えることがあります。')}
          </p>
        </div>
      )}

      <AiSettings />

      {word && <WordSheet word={word.word} sentence={word.sentence} vocab={vocab} onSave={saveVocab} onClose={() => setWord(null)} />}
    </div>
  )
}

/** 単語帳の画面 */
export function Vocab() {
  const [vocab, saveVocab] = useVocab()
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<'todo' | 'all' | 'learned'>('todo')
  const [open, setOpen] = useState<string | null>(null)
  const shown = searchVocab(vocab, q).filter((v) => (filter === 'all' ? true : filter === 'learned' ? v.learned : !v.learned))
  return (
    <div className="screen" role="main">
      <header className="topbar" role="none">
        <button className="icon-btn" aria-label={t('戻る')} onClick={() => (history.length > 1 ? history.back() : go('/study'))}>
          <Icon name="back" />
        </button>
        <h1>{t('単語帳')}</h1>
      </header>
      {vocab.length === 0 ? (
        <div className="empty-state">
          <div className="empty-title">{t('まだ単語がありません')}</div>
          <p className="muted">{t('「英語」のタブで英文の単語を押し、「単語帳に入れる」を選ぶとここに並びます。')}</p>
        </div>
      ) : (
        <>
          <input type="search" className="search" placeholder={t('単語・意味で探す')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('単語を探す')} />
          <div className="segmented" role="group" style={{ marginTop: 10 }}>
            {(
              [
                ['todo', t('覚えていない')],
                ['all', t('すべて')],
                ['learned', t('覚えた')],
              ] as const
            ).map(([k, label]) => (
              <button key={k} aria-pressed={filter === k} onClick={() => setFilter(k)}>
                {label}
              </button>
            ))}
          </div>
          <div className="stack" style={{ marginTop: 12 }}>
            {shown.length === 0 && <div className="muted">{t('見つかりませんでした。')}</div>}
            {shown.map((v) => (
              <div key={v.id} className="card stack">
                <button className="study-vocab-head" aria-expanded={open === v.id} onClick={() => setOpen(open === v.id ? null : v.id)}>
                  <span className="grow">
                    <b lang="en">{v.entry.lemma}</b> <span className="muted">{v.entry.sense}</span>
                  </span>
                  {v.learned && <span className="study-chip">{t('覚えた')}</span>}
                  <Icon name="chevron" />
                </button>
                {open === v.id && (
                  <>
                    <div className="small muted" lang="en">
                      {v.context}
                    </div>
                    <WordBody entry={v.entry} />
                    <div className="row wrap">
                      {speechAvailable() && (
                        <button className="btn small" onClick={() => speak(v.entry.lemma)}>
                          <Icon name="play" />
                          {t('発音を聞く')}
                        </button>
                      )}
                      <button className="btn small" onClick={() => saveVocab(toggleLearned(vocab, v.id))}>
                        {v.learned ? t('覚えていないに戻す') : t('覚えたにする')}
                      </button>
                      <button className="btn small danger" onClick={() => saveVocab(removeVocab(vocab, v.id))}>
                        <Icon name="trash" />
                        {t('削除')}
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
