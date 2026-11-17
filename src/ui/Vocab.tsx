// 単語帳（#/vocab）と今日の復習（#/review）。
// 復習は、カードの表（英単語と出会った文）を見て意味を思い出し、裏を見て「覚えていた／忘れていた」を選ぶ。
// 覚えていた単語は次に出るまでの間が 1・3・7・14・30 日と空いていき、忘れた単語は 10 分後にもう一度出る。

import { useMemo, useState } from 'react'
import { t } from '../lib/i18n'
import { speechAvailable } from '../lib/speech'
import { removeVocab, searchVocab, toggleLearned, type VocabItem } from '../lib/study'
import { applyReview, boxOf, dueItems, LEARNED_BOX } from '../lib/studyTools'
import { go, Icon } from './common'
import { WordBody, speak, useVocab } from './StudyParts'

export function Vocab() {
  const [vocab, saveVocab] = useVocab()
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<'todo' | 'all' | 'learned'>('todo')
  const [open, setOpen] = useState<string | null>(null)
  const shown = searchVocab(vocab, q).filter((v) => (filter === 'all' ? true : filter === 'learned' ? v.learned : !v.learned))
  const due = dueItems(vocab).length
  return (
    <div className="screen" role="main">
      <header className="topbar" role="none">
        <button className="icon-btn" aria-label={t('戻る')} onClick={() => (history.length > 1 ? history.back() : go('/study'))}>
          <Icon name="back" />
        </button>
        <h1>{t('単語帳')}</h1>
      </header>
      {vocab.length > 0 && (
        <button className="card row study-review-card" onClick={() => go('/review')} disabled={!due}>
          <Icon name="history" />
          <span className="grow">
            <span className="small muted">{t('今日の復習')}</span>
            <br />
            <b style={{ fontSize: 22 }}>{t('{n} 枚', { n: due })}</b>
          </span>
          {due > 0 && <span className="btn small primary">{t('はじめる')}</span>}
        </button>
      )}
      {vocab.length === 0 ? (
        <div className="empty-state">
          <div className="empty-title">{t('まだ単語がありません')}</div>
          <p className="muted">{t('「英語」のタブで英文の単語を押し、「単語帳に入れる」を選ぶとここに並びます。')}</p>
        </div>
      ) : (
        <>
          <input type="search" className="search" style={{ marginTop: 12 }} placeholder={t('単語・意味で探す')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('単語を探す')} />
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
                  {v.entry.level && <span className="study-chip">{v.entry.level}</span>}
                  {v.learned && <span className="study-chip">{t('覚えた')}</span>}
                  <Icon name="chevron" />
                </button>
                {open === v.id && (
                  <>
                    <div className="small muted" lang="en">
                      {v.context}
                    </div>
                    <WordBody entry={v.entry} />
                    <div className="small muted">{t('復習の段階 {n} / {max}', { n: Math.min(boxOf(v), LEARNED_BOX), max: LEARNED_BOX })}</div>
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

/** 今日の復習（カード） */
export function Review() {
  const [vocab, saveVocab, ready] = useVocab()
  // 始めた時点の「今日の分」を固定し、答えるたびに 1 枚ずつ進める
  const [queue, setQueue] = useState<string[] | null>(null)
  const [flipped, setFlipped] = useState(false)
  const [stats, setStats] = useState({ ok: 0, ng: 0 })
  const q = useMemo(() => queue ?? (ready ? dueItems(vocab).map((v) => v.id) : null), [queue, ready, vocab])
  const card: VocabItem | undefined = q?.length ? vocab.find((v) => v.id === q[0]) : undefined

  const answer = (correct: boolean) => {
    if (!card || !q) return
    saveVocab(applyReview(vocab, card.id, correct))
    setStats((s) => (correct ? { ...s, ok: s.ok + 1 } : { ...s, ng: s.ng + 1 }))
    setQueue(q.slice(1))
    setFlipped(false)
  }

  return (
    <div className="screen" role="main">
      <header className="topbar" role="none">
        <button className="icon-btn" aria-label={t('戻る')} onClick={() => (history.length > 1 ? history.back() : go('/vocab'))}>
          <Icon name="back" />
        </button>
        <h1>{t('今日の復習')}</h1>
        <div className="grow" />
        {q && <span className="muted small">{t('残り {n} 枚', { n: q.length })}</span>}
      </header>
      {q && !card ? (
        <div className="empty-state">
          <div className="empty-title">{stats.ok + stats.ng ? t('今日の復習はおしまいです') : t('今日の復習はありません')}</div>
          {stats.ok + stats.ng > 0 && <p className="muted">{t('覚えていた {ok} 枚・忘れていた {ng} 枚', stats)}</p>}
          <button className="btn" onClick={() => go('/vocab')}>
            {t('単語帳へ')}
          </button>
        </div>
      ) : card ? (
        <div className="stack">
          <button className="card study-flash" onClick={() => setFlipped(true)} aria-label={flipped ? undefined : t('裏を見る')}>
            <div className="study-flash-word" lang="en">
              {card.entry.lemma}
            </div>
            {card.entry.ipa && <div className="muted">{card.entry.ipa}</div>}
            <div className="small muted" lang="en" style={{ marginTop: 12 }}>
              {card.context}
            </div>
            {!flipped && <div className="small muted" style={{ marginTop: 16 }}>{t('意味を思い出してから押してください')}</div>}
          </button>
          {flipped && (
            <div className="card stack">
              <WordBody entry={card.entry} />
            </div>
          )}
          {flipped ? (
            <div className="row study-review-buttons">
              <button className="btn danger grow" onClick={() => answer(false)}>
                {t('忘れていた')}
              </button>
              <button className="btn primary grow" onClick={() => answer(true)}>
                {t('覚えていた')}
              </button>
            </div>
          ) : (
            <div className="row">
              {speechAvailable() && (
                <button className="btn" onClick={() => speak(card.entry.lemma)}>
                  <Icon name="play" />
                  {t('発音を聞く')}
                </button>
              )}
              <button className="btn primary grow" onClick={() => setFlipped(true)}>
                {t('答えを見る')}
              </button>
            </div>
          )}
        </div>
      ) : null}
    </div>
  )
}
