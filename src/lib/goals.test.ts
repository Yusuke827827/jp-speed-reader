import { describe, expect, it } from 'vitest'
import { achieved, calendarDays, dailyTotals, dayKey, progressOf, streak } from './goals'

const day = (y: number, m: number, d: number, h = 20) => new Date(y, m - 1, d, h).getTime()
const min = (n: number) => n * 60000

describe('読書の目標と連続記録', () => {
  const sessions = [
    { start: day(2026, 10, 24), ms: min(10), chars: 4000 },
    { start: day(2026, 10, 24, 22), ms: min(6), chars: 2000 }, // 同じ日は合算する
    { start: day(2026, 10, 25), ms: min(20), chars: 9000 },
    { start: day(2026, 10, 26), ms: min(16), chars: 7000 },
    { start: day(2026, 10, 27, 8), ms: min(5), chars: 2000 },
  ]
  const totals = dailyTotals(sessions)
  const goal = { kind: 'minutes' as const, amount: 15 }

  it('同じ日の記録を合算する', () => {
    expect(totals.get('2026-10-24')).toEqual({ ms: min(16), chars: 6000 })
  })
  it('分と字数のどちらの目標でも進み具合を出す', () => {
    expect(progressOf(totals.get('2026-10-27'), goal)).toBeCloseTo(5 / 15)
    expect(achieved(totals.get('2026-10-25'), { kind: 'chars', amount: 8000 })).toBe(true)
  })
  it('今日が未達でも、昨日まで続いていれば連続日数を数える', () => {
    expect(streak(totals, goal, day(2026, 10, 27, 9))).toBe(3)
  })
  it('今日も達成すれば、今日を含めて数える', () => {
    const more = dailyTotals([...sessions, { start: day(2026, 10, 27, 12), ms: min(12), chars: 3000 }])
    expect(streak(more, goal, day(2026, 10, 27, 13))).toBe(4)
  })
  it('間が空くと途切れる', () => {
    expect(streak(totals, goal, day(2026, 10, 29, 9))).toBe(0)
  })
  it('カレンダーは月曜始まりで今日まで', () => {
    const days = calendarDays(5, day(2026, 10, 27))
    expect(new Date(days[0]).getDay()).toBe(1)
    expect(dayKey(days[days.length - 1])).toBe('2026-10-27')
    expect(days.length).toBe(4 * 7 + 2) // 2026-10-27 は火曜
  })
})
