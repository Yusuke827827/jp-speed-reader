import { describe, expect, it } from 'vitest'
import { isWarmTime } from './settings'

const at = (h: number) => new Date(2026, 10, 5, h, 30)

describe('夜の暖色表示の時間', () => {
  it('21 時〜6 時のように日をまたぐ範囲', () => {
    const s = { warm: 'night' as const, warmFrom: 21, warmTo: 6 }
    expect([20, 21, 23, 0, 5, 6, 12].map((h) => isWarmTime(s, at(h)))).toEqual([false, true, true, true, true, false, false])
  })
  it('日をまたがない範囲と、いつも・しない', () => {
    expect(isWarmTime({ warm: 'night', warmFrom: 1, warmTo: 5 }, at(3))).toBe(true)
    expect(isWarmTime({ warm: 'night', warmFrom: 1, warmTo: 5 }, at(5))).toBe(false)
    expect(isWarmTime({ warm: 'always', warmFrom: 21, warmTo: 6 }, at(12))).toBe(true)
    expect(isWarmTime({ warm: 'off', warmFrom: 21, warmTo: 6 }, at(23))).toBe(false)
  })
})
