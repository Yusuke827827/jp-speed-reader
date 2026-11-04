import { describe, expect, it } from 'vitest'
import { activeTheme } from './settings'

describe('ダークモードに合わせた配色', () => {
  it('明るい配色は、端末がダークモードのときだけ暗い配色に替える', () => {
    expect(activeTheme({ theme: 'paper', autoDark: true, darkTheme: 'dark' }, true)).toBe('dark')
    expect(activeTheme({ theme: 'paper', autoDark: true, darkTheme: 'dark' }, false)).toBe('paper')
  })
  it('暗い配色を選んでいるときや、切り替えを切っているときはそのまま', () => {
    expect(activeTheme({ theme: 'night', autoDark: true, darkTheme: 'dark' }, true)).toBe('night')
    expect(activeTheme({ theme: 'washi', autoDark: false, darkTheme: 'dark' }, true)).toBe('washi')
  })
})
