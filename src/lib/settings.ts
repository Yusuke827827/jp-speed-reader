import { useCallback, useEffect, useState } from 'react'
import { getKV, setKV } from './db'
import type { ChunkMode } from './segment'

export type Theme = 'paper' | 'light' | 'sepia' | 'gray' | 'dark' | 'black'
export type PersonLabel = 'off' | 'chapter3' | 'first3' | 'always'
export type FontFamily = 'mincho' | 'gothic'
export type Guide = 'none' | 'center' | 'focus'
export type Direction = 'horizontal' | 'vertical'

export interface Settings {
  theme: Theme
  font: FontFamily
  /** 高速読書の基準文字サイズ（px） */
  fontSize: number
  guide: Guide
  direction: Direction
  mode: ChunkMode
  phraseTarget: number
  /** これより短い単位は隣とつなぐ（1 = つながない） */
  minChars: number
  cpm: number
  pauses: boolean
  pauseScale: number
  /** 再生開始直後の数単位をゆっくり表示する */
  rampUp: boolean
  /** 一時停止中に前後の文を表示する */
  showContext: boolean
  /** 再生中に残り時間と進捗バーを表示する */
  showProgressWhilePlaying: boolean
  /** 登録した人物名を色分けする */
  personColors: boolean
  /** 人物の説明をいつ表示するか */
  personLabel: PersonLabel
  /** 人物名を含む単位を少し長く表示する */
  nameBoost: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  theme: 'paper',
  font: 'mincho',
  fontSize: 52,
  guide: 'center',
  direction: 'horizontal',
  mode: 'bunsetsu',
  phraseTarget: 7,
  minChars: 3,
  cpm: 600,
  pauses: true,
  pauseScale: 1,
  rampUp: true,
  showContext: true,
  showProgressWhilePlaying: true,
  personColors: true,
  personLabel: 'chapter3',
  nameBoost: true,
}

export const THEMES: { id: Theme; label: string; bg: string; fg: string }[] = [
  { id: 'paper', label: '紙', bg: '#f3f0e8', fg: '#1f1d1a' },
  { id: 'light', label: '白', bg: '#fbfaf7', fg: '#1b1b1b' },
  { id: 'sepia', label: 'セピア', bg: '#f1e7d0', fg: '#3b2f1e' },
  { id: 'gray', label: 'グレー', bg: '#3a3d42', fg: '#e8e6e1' },
  { id: 'dark', label: '黒', bg: '#1d1f24', fg: '#e9e5dc' },
  { id: 'black', label: '真っ黒', bg: '#000000', fg: '#c9c5bc' },
]

const KEY = 'settings'
let cache: Settings | null = null
const listeners = new Set<(s: Settings) => void>()

export async function loadSettings(): Promise<Settings> {
  if (cache) return cache
  try {
    const saved = await getKV<Partial<Settings>>(KEY)
    cache = { ...DEFAULT_SETTINGS, ...(saved ?? {}) }
  } catch {
    cache = { ...DEFAULT_SETTINGS }
  }
  return cache
}

export function useSettings() {
  const [settings, setLocal] = useState<Settings>(cache ?? DEFAULT_SETTINGS)
  useEffect(() => {
    let alive = true
    loadSettings().then((s) => alive && setLocal(s))
    const l = (s: Settings) => setLocal(s)
    listeners.add(l)
    return () => {
      alive = false
      listeners.delete(l)
    }
  }, [])
  const update = useCallback((patch: Partial<Settings>) => {
    const next = { ...(cache ?? DEFAULT_SETTINGS), ...patch }
    cache = next
    listeners.forEach((l) => l(next))
    setKV(KEY, next).catch(() => {})
  }, [])
  return [settings, update] as const
}
