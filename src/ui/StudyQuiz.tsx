// 教材の問題（#/quiz/:id）と分析（#/analysis）。
// 問題は AI が教材の英文から作る試験形式の 4 択。答えた結果を「力」ごとにまとめ、苦手な順に出す。

import { useEffect, useState } from 'react'
import { t } from '../lib/i18n'
import type { Sentence } from '../lib/study'
import { generateQuiz, loadAnalyses, loadAnswers, loadQuiz, saveAnswers } from '../lib/studyAi'
import { SKILL_GRAMMAR, SKILL_NOTES, overall, skillStats, type Answer, type Question, type Quiz, type Skill, type SkillState } from '../lib/studyQuiz'
import { dueItems, sentencesOf } from '../lib/studyTools'
import { go, Icon } from './common'
import { useMaterials } from './Study'
import { errorText, useVocab } from './StudyParts'

function typeLabel(q: Question): string {
  switch (q.type) {
    case 'translation':
      return t('和訳')
    case 'meaning':
      return t('語句の意味')
    case 'reference':
      return t('指示語')
    default:
      return t('内容一致')
  }
}

export function stateLabel(s: SkillState): string {
  return s === 'weak' ? t('苦手') : s === 'practice' ? t('練習中') : s === 'good' ? t('得意') : t('未測定')
}

export function QuizView({ id }: { id: string }) {
  const [materials] = useMaterials()
  const m = materials?.find((x) => x.id === id)
  const [quiz, setQuiz] = useState<Quiz | null | undefined>(undefined)
  const [sentences, setSentences] = useState<Sentence[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [i, setI] = useState(0)
  const [picked, setPicked] = useState<number | null>(null)
  const [results, setResults] = useState<boolean[]>([])

  useEffect(() => {
    loadQuiz(id).then((q) => setQuiz(q ?? null))
  }, [id])
  useEffect(() => {
    if (m) loadAnalyses(m).then((a) => setSentences(sentencesOf(a)))
  }, [m])

  const make = async () => {
    if (!m) return
    setBusy(true)
    setErr(null)
    try {
      setQuiz(await generateQuiz(m))
      restart()
    } catch (e) {
      setErr(errorText(e))
    } finally {
      setBusy(false)
    }
  }
  const restart = () => {
    setI(0)
    setPicked(null)
    setResults([])
  }

  const q = quiz?.questions[i]
  // 最後の問題の解説を読み、「結果を見る」を押したら結果へ
  const finished = !!quiz && i >= quiz.questions.length

  const choose = (k: number) => {
    if (picked !== null || !q || !quiz) return
    setPicked(k)
    const next = [...results, k === q.answer]
    setResults(next)
    if (next.length === quiz.questions.length) {
      const now = Date.now()
      saveAnswers(quiz.questions.map((x, n): Answer => ({ materialId: id, question: n, skill: x.skill, correct: next[n], at: now }))).catch(() => undefined)
    }
  }

  return (
    <div className="screen" role="main">
      <header className="topbar" role="none">
        <button className="icon-btn" aria-label={t('戻る')} onClick={() => go(`/m/${id}`)}>
          <Icon name="back" />
        </button>
        <h1>{t('問題')}</h1>
        <div className="grow" />
        {q && (
          <span className="small muted">
            {i + 1} / {quiz.questions.length}
          </span>
        )}
      </header>
      {m && (
        <div className="small muted" lang="en" style={{ marginBottom: 8 }}>
          {m.title}
        </div>
      )}

      {quiz === null && (
        <div className="card stack">
          <div>{t('この教材から、試験形式の4択問題を作ります（和訳・語句の意味・指示語・内容一致）。')}</div>
          <button className="btn primary" disabled={busy || !m} onClick={make}>
            <Icon name="bolt" />
            {busy ? t('問題を作っています…') : t('問題を作る')}
          </button>
          {err && <div className="notice error">{err}</div>}
        </div>
      )}

      {q && (
        <div className="stack">
          <div className="card stack">
            <div className="row">
              <span className="study-chip">{typeLabel(q)}</span>
              <span className="small muted">{q.skill}</span>
            </div>
            <div className="study-q-prompt">{q.prompt}</div>
            {q.quote && (
              <div className="study-quote" lang="en">
                {q.quote}
              </div>
            )}
          </div>
          <div className="stack" role="group" aria-label={t('選択肢')}>
            {q.choices.map((c, k) => {
              const state = picked === null ? '' : k === q.answer ? ' correct' : k === picked ? ' wrong' : ''
              return (
                <button key={k} className={`card study-choice${state}`} disabled={picked !== null} onClick={() => choose(k)}>
                  <span className="study-choice-no">{k + 1}</span>
                  <span className="grow">{c}</span>
                </button>
              )
            })}
          </div>
          {picked !== null && (
            <div className="card stack">
              <b className={picked === q.answer ? 'study-ok' : 'study-ng'}>{picked === q.answer ? t('正解') : t('不正解（正解は {n}）', { n: q.answer + 1 })}</b>
              <div>{q.explanation}</div>
              {q.sentence >= 0 && sentences[q.sentence] && (
                <div className="small">
                  <div className="muted">{t('根拠の文（{n}文目）', { n: q.sentence + 1 })}</div>
                  <div lang="en">{sentences[q.sentence].en}</div>
                  <div className="muted">{sentences[q.sentence].ja}</div>
                </div>
              )}
              <button
                className="btn primary"
                onClick={() => {
                  setI((n) => n + 1)
                  setPicked(null)
                }}
              >
                {i + 1 < quiz!.questions.length ? t('次の問題') : t('結果を見る')}
              </button>
            </div>
          )}
        </div>
      )}

      {finished && (
        <div className="stack">
          <div className="card stack" style={{ alignItems: 'center' }}>
            <div className="study-score">{t('{a} / {b} 問正解', { a: results.filter(Boolean).length, b: results.length })}</div>
            <div className="study-tags">
              {quiz!.questions.map((x, n) => (
                <span key={n} className={`study-chip ${results[n] ? 'study-ok' : 'study-ng'}`}>
                  {results[n] ? '○' : '×'} {x.skill}
                </span>
              ))}
            </div>
          </div>
          <button className="btn primary" onClick={() => go('/analysis')}>
            <Icon name="chart" />
            {t('分析を見る')}
          </button>
          <div className="row wrap">
            <button className="btn small" onClick={restart}>
              <Icon name="restart" />
              {t('もう一度解く')}
            </button>
            <button className="btn small" disabled={busy} onClick={make}>
              <Icon name="bolt" />
              {busy ? t('問題を作っています…') : t('別の問題を作る')}
            </button>
            <button className="btn small" onClick={() => go(`/m/${id}`)}>
              {t('教材に戻る')}
            </button>
          </div>
          {err && <div className="notice error">{err}</div>}
        </div>
      )}
    </div>
  )
}

/** 分析：力ごとの状態、全体の正答率、単語帳 */
export function Analysis() {
  const [answers, setAnswers] = useState<Answer[] | null>(null)
  const [materials] = useMaterials()
  const [vocab] = useVocab()
  const [open, setOpen] = useState<Skill | null>(null)
  const [wrong, setWrong] = useState<{ q: Question; title: string; id: string }[]>([])

  useEffect(() => {
    loadAnswers().then(setAnswers)
  }, [])

  // 開いた力の、最近間違えた問題を集める
  useEffect(() => {
    if (!open || !answers) return
    ;(async () => {
      const out: { q: Question; title: string; id: string }[] = []
      const misses = answers.filter((a) => a.skill === open && !a.correct).slice(-5).reverse()
      for (const a of misses) {
        const quiz = await loadQuiz(a.materialId)
        const q = quiz?.questions[a.question]
        if (q && q.skill === open) out.push({ q, id: a.materialId, title: materials?.find((x) => x.id === a.materialId)?.title ?? '' })
      }
      setWrong(out)
    })()
  }, [open, answers, materials])

  const stats = skillStats(answers ?? [])
  const all = overall(answers ?? [])
  return (
    <div className="screen" role="main">
      <header className="topbar" role="none">
        <button className="icon-btn" aria-label={t('戻る')} onClick={() => (history.length > 1 ? history.back() : go('/study'))}>
          <Icon name="back" />
        </button>
        <h1>{t('分析')}</h1>
      </header>

      <div className="study-stats">
        <div className="card">
          <div className="small muted">{t('教材')}</div>
          <b>{materials?.length ?? 0}</b>
        </div>
        <div className="card">
          <div className="small muted">{t('解いた問題')}</div>
          <b>{all.n}</b>
        </div>
        <div className="card">
          <div className="small muted">{t('正答率')}</div>
          <b>{all.rate === null ? '—' : `${all.rate}%`}</b>
        </div>
        <div className="card">
          <div className="small muted">{t('覚えた単語')}</div>
          <b>
            {vocab.filter((v) => v.learned).length}
            <span className="small muted"> / {vocab.length}</span>
          </b>
        </div>
      </div>
      {dueItems(vocab).length > 0 && (
        <button className="btn" style={{ marginTop: 10 }} onClick={() => go('/review')}>
          <Icon name="history" />
          {t('今日の復習 {n} 枚', { n: dueItems(vocab).length })}
        </button>
      )}

      <div className="section-title">{t('いまの状態')}</div>
      {answers && !answers.length && <p className="small muted">{t('教材の「問題を解く」で答えると、力ごとの状態がここに出ます。')}</p>}
      <div className="card study-skill-list">
        {stats.map((s) => (
          <div key={s.skill} className="study-skill">
            <button className="study-skill-head" aria-expanded={open === s.skill} onClick={() => setOpen(open === s.skill ? null : s.skill)}>
              <span className={`study-state state-${s.state}`}>{stateLabel(s.state)}</span>
              <span className="grow">
                <b>{s.skill}</b> {s.rate !== null && <span className="small muted">{t('{rate}%（直近{n}問）', { rate: s.rate, n: s.n })}</span>}
                <div className="small muted">{SKILL_NOTES[s.skill]}</div>
              </span>
              <Icon name="chevron" />
            </button>
            {open === s.skill && (
              <div className="stack study-skill-body">
                {wrong.length ? (
                  <>
                    <div className="small muted">{t('最近間違えた問題')}</div>
                    {wrong.map((w, k) => (
                      <button key={k} className="study-link" onClick={() => go(`/quiz/${w.id}`)}>
                        <div>{w.q.prompt}</div>
                        {w.q.quote && (
                          <div className="small" lang="en">
                            {w.q.quote}
                          </div>
                        )}
                        <div className="small muted">{w.q.explanation}</div>
                      </button>
                    ))}
                  </>
                ) : (
                  <div className="small muted">{s.n ? t('最近間違えた問題はありません。') : t('まだこの力を測る問題を解いていません。')}</div>
                )}
                {SKILL_GRAMMAR[s.skill] && (
                  <button className="btn small" onClick={() => go(`/grammar/${encodeURIComponent(SKILL_GRAMMAR[s.skill]!)}`)}>
                    {t('教材から例文を見る（{g}）', { g: SKILL_GRAMMAR[s.skill]! })}
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
