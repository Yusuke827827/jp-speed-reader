// 読書の目標と連続記録。読書の記録（Session）を日ごとに集計して、目標に届いた日と連続日数を求める。
// 日の区切りは端末の時刻の 0 時。

export type GoalKind = 'minutes' | 'chars'

export interface Goal {
  kind: GoalKind
  /** 分、または字数 */
  amount: number
}

export interface DayTotal {
  ms: number
  chars: number
}

interface SessionLike {
  start: number
  ms: number
  chars: number
}

/** 端末の時刻で、その日を表す文字列（YYYY-MM-DD） */
export function dayKey(t: number): string {
  const d = new Date(t)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function dailyTotals(sessions: SessionLike[]): Map<string, DayTotal> {
  const out = new Map<string, DayTotal>()
  for (const s of sessions) {
    const k = dayKey(s.start)
    const cur = out.get(k) ?? { ms: 0, chars: 0 }
    cur.ms += s.ms
    cur.chars += s.chars
    out.set(k, cur)
  }
  return out
}

/** その日の進み具合（目標に対する割合、0〜1 を超えることもある） */
export function progressOf(total: DayTotal | undefined, goal: Goal): number {
  if (!total || goal.amount <= 0) return 0
  return goal.kind === 'minutes' ? total.ms / 60000 / goal.amount : total.chars / goal.amount
}

export function achieved(total: DayTotal | undefined, goal: Goal): boolean {
  return progressOf(total, goal) >= 1
}

/**
 * 連続して目標に届いた日数。今日がまだ届いていなくても、昨日まで続いていれば数える
 * （今日の分はまだ読めるので、0 時を過ぎた途端に途切れて見えないようにする）。
 */
export function streak(totals: Map<string, DayTotal>, goal: Goal, now = Date.now()): number {
  const d = new Date(now)
  d.setHours(12, 0, 0, 0) // 夏時間の境目でも日付がずれないよう昼で数える
  if (!achieved(totals.get(dayKey(d.getTime())), goal)) d.setDate(d.getDate() - 1)
  let n = 0
  while (achieved(totals.get(dayKey(d.getTime())), goal)) {
    n++
    d.setDate(d.getDate() - 1)
  }
  return n
}

/** カレンダー用に、今日を含む直近 weeks 週間の日付（月曜始まり、古い順） */
export function calendarDays(weeks: number, now = Date.now()): number[] {
  const end = new Date(now)
  end.setHours(12, 0, 0, 0)
  const mondayOffset = (end.getDay() + 6) % 7 // 0 = 月曜
  const start = new Date(end)
  start.setDate(end.getDate() - mondayOffset - (weeks - 1) * 7)
  const out: number[] = []
  for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) out.push(d.getTime())
  return out
}
