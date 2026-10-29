// 理解度の確認のシート。直前に読んだ範囲から 3 問出し、答え合わせのあと元の文へ飛べる。

import { useState } from 'react'
import type { BookText, TextPosition } from '../lib/book'
import { t } from '../lib/i18n'
import { buildQuiz, type Question, type SentenceRef } from '../lib/quiz'
import { Icon } from './common'

const clip = (s: string, n = 70) => (s.length > n ? s.slice(0, n) + '…' : s)

function isRight(q: Question, picked: string) {
  return q.kind === 'cloze' ? picked === q.answer : picked === q.first
}

export function QuizSheet(props: { book: BookText; pos: TextPosition; names: string[]; onJump: (pos: TextPosition) => void; onClose: () => void }) {
  const make = () => buildQuiz(props.book, props.pos, props.names)
  const [qs, setQs] = useState<Question[]>(make)
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState<string[]>([])

  const q = qs[step]
  const picked = answers[step]
  const done = qs.length > 0 && step >= qs.length
  const score = answers.filter((a, i) => qs[i] && isRight(qs[i], a)).length

  const pick = (v: string) => {
    if (picked !== undefined) return
    const next = [...answers]
    next[step] = v
    setAnswers(next)
  }
  const retry = () => {
    setQs(make())
    setStep(0)
    setAnswers([])
  }
  const jump = (s: SentenceRef) => {
    props.onJump({ para: s.para, offset: s.start })
    props.onClose()
  }
  const sourceOf = (x: Question) => (x.kind === 'cloze' ? x.src : x.first === 'a' ? x.a : x.b)

  return (
    <>
      <div className="sheet-backdrop" onClick={props.onClose} />
      <div className="sheet stack" role="dialog" aria-label={t('理解度の確認')}>
        <div className="row">
          <div className="grow" style={{ fontWeight: 700, fontSize: 17 }}>
            {t('理解度の確認')}
          </div>
          <button className="icon-btn" aria-label={t('閉じる')} onClick={props.onClose}>
            <Icon name="close" />
          </button>
        </div>

        {qs.length === 0 ? (
          <p className="muted">{t('まだ確認できるほど読んでいません。もう少し読んでから試してください。')}</p>
        ) : done ? (
          <>
            <div className="quiz-score">
              <b>{t('{n}問中{k}問 正解', { n: qs.length, k: score })}</b>
            </div>
            <ul className="list">
              {qs.map((x, i) => (
                <li key={i}>
                  <button onClick={() => jump(sourceOf(x))}>
                    <span className={`quiz-mark ${isRight(x, answers[i]) ? 'ok' : 'ng'}`}>{isRight(x, answers[i]) ? '○' : '×'}</span>
                    <span className="grow note-snippet">{clip(sourceOf(x).text)}</span>
                    <span className="small muted" style={{ whiteSpace: 'nowrap' }}>
                      {t('本文へ')}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <button className="btn primary" onClick={retry}>
              {t('別の問題でもう一度')}
            </button>
          </>
        ) : (
          <>
            <div className="small muted">
              {t('第{i}問／{n}問・直前に読んだ所から出題します', { i: step + 1, n: qs.length })}
            </div>
            {q.kind === 'cloze' ? (
              <>
                <div style={{ fontWeight: 700 }}>{t('空欄に入る語はどれですか')}</div>
                <p className="note-sentence">
                  {q.before}
                  <span className="quiz-blank">{picked === undefined ? '　　' : q.answer}</span>
                  {q.after}
                </p>
                <div className="quiz-choices">
                  {q.choices.map((c) => (
                    <button key={c} className={`btn${picked === undefined ? '' : c === q.answer ? ' quiz-ok' : c === picked ? ' quiz-ng' : ''}`} onClick={() => pick(c)}>
                      {c}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <div style={{ fontWeight: 700 }}>{t('どちらの文が先に出てきましたか')}</div>
                <div className="quiz-choices order">
                  {(['a', 'b'] as const).map((k) => (
                    <button key={k} className={`btn${picked === undefined ? '' : k === q.first ? ' quiz-ok' : k === picked ? ' quiz-ng' : ''}`} onClick={() => pick(k)}>
                      {clip(q[k].text, 90)}
                    </button>
                  ))}
                </div>
              </>
            )}
            {picked !== undefined && (
              <div className="row">
                <span className={`grow quiz-result ${isRight(q, picked) ? 'ok' : 'ng'}`}>{isRight(q, picked) ? t('正解です') : t('違います')}</span>
                <button className="btn primary" onClick={() => setStep(step + 1)}>
                  {step + 1 < qs.length ? t('次へ') : t('結果を見る')}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  )
}
