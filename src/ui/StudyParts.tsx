// 英語学習の画面で共通に使う部品：S・V・O・C の印を付けた文、単語の説明シート、単語帳の読み書き。

import { useEffect, useState } from 'react'
import { getKV, setKV } from '../lib/db'
import { t } from '../lib/i18n'
import { speechAvailable, unlockSpeech, voicesFor } from '../lib/speech'
import { EIKEN, MAX_INPUT, addVocab, tokenize, vocabId, type Direction, type Part, type Role, type Sentence, type VocabItem, type WordEntry } from '../lib/study'
import { StudyError, lookupWord } from '../lib/studyAi'
import { go, Icon, toast } from './common'

export const VOCAB_KEY = 'vocab'

export function roleName(r: Role): string {
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

export function useVocab(): [VocabItem[], (next: VocabItem[]) => void, boolean] {
  const [list, setList] = useState<VocabItem[]>([])
  const [ready, setReady] = useState(false)
  useEffect(() => {
    getKV<VocabItem[]>(VOCAB_KEY)
      .then((v) => setList(v ?? []))
      .catch(() => setList([]))
      .finally(() => setReady(true))
  }, [])
  const save = (next: VocabItem[]) => {
    setList(next)
    setKV(VOCAB_KEY, next).catch(() => toast(t('保存できませんでした')))
  }
  return [list, save, ready]
}

export function speak(text: string, rate = 1) {
  if (!speechAvailable()) return
  unlockSpeech()
  const u = new SpeechSynthesisUtterance(text)
  u.lang = 'en-US'
  u.rate = rate
  const v = voicesFor('en')[0]
  if (v) u.voice = v
  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(u)
}

/** 押せる単語を並べる */
export function Words({ text, onWord }: { text: string; onWord: (w: string) => void }) {
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
      <span className={`study-part-text${part.inner.length ? ' has-inner' : ''}`}>
        {part.inner.length ? (
          part.inner.map((x, i) => (
            <span key={i} className={`study-inner role-${x.role}`}>
              <span className="study-part-text">
                <Words text={x.text} onWord={onWord} />
              </span>
              <span className="study-label">{x.role === 'X' ? '' : x.role.toLowerCase()}</span>
            </span>
          ))
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

export interface SentenceActions {
  onWord: (w: string, sentence: string) => void
  onFlow: (s: Sentence) => void
  onReadAloud: (s: Sentence) => void
  onShare: (s: Sentence) => void
  onAddHard: (s: Sentence) => void
}

export function SentenceCard({ s, direction, actions }: { s: Sentence; direction: Direction; actions: SentenceActions }) {
  const onWord = (w: string) => actions.onWord(w, s.en)
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

      {direction === 'fix' && (
        <div className="study-fix stack">
          <div>
            <div className="small muted">{t('直す前')}</div>
            <div lang="en" className="study-original">
              {s.original}
            </div>
          </div>
          {s.fixes.length ? (
            <ul className="study-list">
              {s.fixes.map((f, i) => (
                <li key={i}>
                  <span lang="en">
                    <del>{f.before || '—'}</del> → <ins>{f.after || '—'}</ins>
                  </span>
                  <div className="small muted">{f.reason}</div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="small">{t('直すところはありません。')}</div>
          )}
          <div className="small muted">{t('直した文')}</div>
        </div>
      )}

      <div className="study-parts" lang="en">
        {s.parts.map((p, i) => (
          <PartView key={i} part={p} onWord={onWord} />
        ))}
      </div>
      {!s.checked && <div className="notice warn small">{t('AI の区切りが元の文と一致しません。印は参考にしてください。')}</div>}
      <div className="study-ja">{s.ja}</div>
      {s.explanation && <div className="small muted">{s.explanation}</div>}

      {s.grammar.length > 0 && (
        <div className="study-tags" aria-label={t('文法')}>
          {s.grammar.map((g) => (
            <button key={g} className="study-chip" onClick={() => go(`/grammar/${encodeURIComponent(g)}`)}>
              {g}
            </button>
          ))}
        </div>
      )}

      {s.hard.length > 0 && (
        <div className="stack" style={{ gap: 6 }}>
          <div className="small muted">{t('難しめの単語')}</div>
          <div className="study-tags">
            {s.hard.map((h) => (
              <button key={h.word} className="study-chip study-hard" onClick={() => onWord(h.word)}>
                <span lang="en">{h.word}</span> <span className="muted">{h.level}</span>
              </button>
            ))}
          </div>
          <button className="btn small" onClick={() => actions.onAddHard(s)}>
            <Icon name="bookmark" />
            {t('難しめの単語をまとめて単語帳に入れる')}
          </button>
        </div>
      )}

      {s.alt.length > 0 && (
        <div className="small">
          <div className="muted">{direction === 'en-ja' ? t('別の訳') : t('別の言い方')}</div>
          <ul className="study-alt">
            {s.alt.map((a, i) => (
              <li key={i} lang={direction === 'en-ja' ? 'ja' : 'en'}>
                {a}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="row wrap study-actions">
        <button className="btn small" onClick={() => actions.onFlow(s)}>
          <Icon name="bolt" />
          {t('流して読む')}
        </button>
        <button className="btn small" onClick={() => actions.onReadAloud(s)}>
          <Icon name="people" />
          {t('音読練習')}
        </button>
        <button className="btn small" onClick={() => actions.onShare(s)}>
          <Icon name="pdf" />
          {t('画像で保存')}
        </button>
      </div>
    </div>
  )
}

export function Legend() {
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

export function levelText(level: WordEntry['level']): string {
  return level ? t('{level}（英検{eiken}程度）', { level, eiken: EIKEN[level] }) : ''
}

export function WordBody({ entry }: { entry: WordEntry }) {
  return (
    <div className="stack study-entry">
      <div>
        <div className="small muted">{t('この文での意味')}</div>
        <div style={{ fontSize: 18, fontWeight: 600 }}>{entry.sense}</div>
        {entry.level && <div className="small muted">{levelText(entry.level)}</div>}
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

/** 単語の説明（下から出るシート） */
export function WordSheet(props: { word: string; sentence: string; onClose: () => void; vocab: VocabItem[]; onSave: (list: VocabItem[]) => void }) {
  const [entry, setEntry] = useState<WordEntry | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    lookupWord(props.word, props.sentence)
      .then(setEntry)
      .catch((e) => setErr(errorText(e)))
  }, [props.word, props.sentence])
  const saved = entry && props.vocab.some((v) => v.id === vocabId(entry.lemma))
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
