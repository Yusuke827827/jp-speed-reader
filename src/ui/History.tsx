import { useEffect, useMemo, useState } from 'react'
import { listSessions, type Session } from '../lib/db'
import { t } from '../lib/i18n'
import { formatDate, formatDuration, go, Icon } from './common'

export function History() {
  const [sessions, setSessions] = useState<Session[] | null>(null)
  useEffect(() => {
    listSessions().then(setSessions).catch(() => setSessions([]))
  }, [])

  const stats = useMemo(() => {
    const xs = sessions ?? []
    const ms = xs.reduce((a, s) => a + s.ms, 0)
    const chars = xs.reduce((a, s) => a + s.chars, 0)
    // 直近 14 日の日別の読書時間
    const days: { label: string; ms: number }[] = []
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    for (let i = 13; i >= 0; i--) {
      const d = new Date(today)
      d.setDate(today.getDate() - i)
      const next = d.getTime() + 86400000
      days.push({
        label: `${d.getMonth() + 1}/${d.getDate()}`,
        ms: xs.filter((s) => s.start >= d.getTime() && s.start < next).reduce((a, s) => a + s.ms, 0),
      })
    }
    return { ms, chars, cpm: ms > 0 ? Math.round((chars / ms) * 60000) : 0, days }
  }, [sessions])

  const max = Math.max(1, ...stats.days.map((d) => d.ms))

  return (
    <div className="screen">
      <header className="topbar">
        <button className="icon-btn" aria-label={t('本棚へ戻る')} onClick={() => go('/')}>
          <Icon name="back" />
        </button>
        <h1>{t('読書履歴')}</h1>
      </header>

      <div className="stats">
        <div className="card stat">
          <b>{formatDuration(stats.ms)}</b>
          <span className="small muted">{t('合計時間')}</span>
        </div>
        <div className="card stat">
          <b>{stats.chars.toLocaleString()}</b>
          <span className="small muted">{t('読んだ文字数')}</span>
        </div>
        <div className="card stat">
          <b>{stats.cpm}</b>
          <span className="small muted">{t('平均 字/分')}</span>
        </div>
      </div>

      <div className="section-title">{t('直近14日')}</div>
      <div className="card">
        <div className="bars" role="img" aria-label={t('直近14日の読書時間')}>
          {stats.days.map((d) => (
            <div key={d.label}>
              <div className="bar" style={{ height: `${(d.ms / max) * 100}%` }} title={`${d.label} ${formatDuration(d.ms)}`} />
              <span>{d.label.split('/')[1]}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="section-title">{t('記録')}</div>
      {sessions === null ? (
        <p className="muted">{t('読み込み中…')}</p>
      ) : sessions.length === 0 ? (
        <p className="muted">{t('まだ記録がありません。高速読書で再生して一時停止すると、ここに記録されます。')}</p>
      ) : (
        <div className="card">
          <ul className="list">
            {sessions.slice(0, 200).map((s) => (
              <li key={s.id}>
                <button onClick={() => go(`/read/${s.bookId}`)}>
                  <span className="grow">
                    <span style={{ fontWeight: 600 }}>{s.title}</span>
                    <br />
                    <span className="small muted">
                      {t('{date}・{duration}・{chars}字・{cpm}字/分', { date: formatDate(s.start), duration: formatDuration(s.ms), chars: s.chars.toLocaleString(), cpm: s.cpm })}
                    </span>
                  </span>
                  <span className="small muted" style={{ whiteSpace: 'nowrap' }}>
                    {s.fromPercent.toFixed(0)}→{s.toPercent.toFixed(0)}%
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
