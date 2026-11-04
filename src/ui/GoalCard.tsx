// 読書の目標: 今日の進み具合・連続日数・直近 5 週間のカレンダー。目標の変更もここで行う。

import { useMemo } from 'react'
import type { Session } from '../lib/db'
import { achieved, calendarDays, dailyTotals, dayKey, progressOf, streak, type Goal } from '../lib/goals'
import { t } from '../lib/i18n'
import { useSettings } from '../lib/settings'

export function useGoal(): Goal {
  const [s] = useSettings()
  return { kind: s.goalKind, amount: s.goalKind === 'minutes' ? s.goalMinutes : s.goalChars }
}

function todayText(sessions: Session[], goal: Goal) {
  const total = dailyTotals(sessions).get(dayKey(Date.now()))
  const done = goal.kind === 'minutes' ? Math.floor((total?.ms ?? 0) / 60000) : (total?.chars ?? 0)
  return goal.kind === 'minutes'
    ? t('今日 {done}/{goal}分', { done, goal: goal.amount })
    : t('今日 {done}/{goal}字', { done: done.toLocaleString(), goal: goal.amount.toLocaleString() })
}

/** 本棚に出す短い表示 */
export function GoalChip({ sessions }: { sessions: Session[] }) {
  const goal = useGoal()
  const totals = useMemo(() => dailyTotals(sessions), [sessions])
  const n = streak(totals, goal)
  const done = achieved(totals.get(dayKey(Date.now())), goal)
  return (
    <div className={`goal-chip${done ? ' done' : ''}`}>
      {todayText(sessions, goal)}
      {n > 0 && <span>{t('・連続{n}日', { n })}</span>}
    </div>
  )
}

export function GoalCard({ sessions }: { sessions: Session[] }) {
  const [s, update] = useSettings()
  const goal = useGoal()
  const totals = useMemo(() => dailyTotals(sessions), [sessions])
  const today = totals.get(dayKey(Date.now()))
  const ratio = Math.min(1, progressOf(today, goal))
  const n = streak(totals, goal)
  const days = calendarDays(5)
  const weekdays = [t('月'), t('火'), t('水'), t('木'), t('金'), t('土'), t('日')]

  return (
    <div className="card stack goal-card">
      <div className="row">
        <div className="grow">
          <div style={{ fontWeight: 700 }}>{todayText(sessions, goal)}</div>
          <div className="small muted">{ratio >= 1 ? t('今日の目標を達成しました') : t('あと少しで今日の目標です')}</div>
        </div>
        <div className="goal-streak">
          <b>{n}</b>
          <span className="small muted">{t('連続日数')}</span>
        </div>
      </div>
      <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(ratio * 100)} aria-label={t('今日の進み具合')}>
        <div style={{ width: `${ratio * 100}%` }} />
      </div>

      <div className="goal-cal" role="img" aria-label={t('直近5週間の達成した日')}>
        {weekdays.map((w) => (
          <span key={w} className="goal-wd">
            {w}
          </span>
        ))}
        {days.map((d) => {
          const k = dayKey(d)
          const tot = totals.get(k)
          const ok = achieved(tot, goal)
          const some = !ok && (tot?.ms ?? 0) > 0
          const isToday = k === dayKey(Date.now())
          return (
            <span key={k} className={`goal-day${ok ? ' ok' : some ? ' some' : ''}${isToday ? ' today' : ''}`} title={k}>
              {new Date(d).getDate()}
            </span>
          )
        })}
      </div>

      <div className="field">
        <div className="label">{t('1日の目標')}</div>
        <div className="row wrap">
          <div className="segmented" role="group">
            <button aria-pressed={s.goalKind === 'minutes'} onClick={() => update({ goalKind: 'minutes' })}>
              {t('時間')}
            </button>
            <button aria-pressed={s.goalKind === 'chars'} onClick={() => update({ goalKind: 'chars' })}>
              {t('字数')}
            </button>
          </div>
          {s.goalKind === 'minutes' ? (
            <label className="row">
              <input type="number" inputMode="numeric" min={1} max={600} value={s.goalMinutes} onChange={(e) => update({ goalMinutes: Math.max(1, Math.min(600, Number(e.target.value) || 1)) })} style={{ maxWidth: 90 }} aria-label={t('1日の目標')} />
              <span className="small muted">{t('分')}</span>
            </label>
          ) : (
            <label className="row">
              <input type="number" inputMode="numeric" min={100} step={500} value={s.goalChars} onChange={(e) => update({ goalChars: Math.max(100, Number(e.target.value) || 100) })} style={{ maxWidth: 110 }} aria-label={t('1日の目標')} />
              <span className="small muted">{t('字')}</span>
            </label>
          )}
        </div>
      </div>
    </div>
  )
}
