import { useCallback, useEffect, useState } from 'react'
import { getKV, setKV } from './db'
import { detectLang, setUiLang } from './i18n'
import type { ChunkMode } from './segment'

export type Theme = 'paper' | 'light' | 'sepia' | 'gray' | 'dark' | 'black' | 'night' | 'washi' | 'aurora' | 'parchment' | 'sakura' | 'forest' | 'ocean'
export type PersonLabel = 'off' | 'chapter3' | 'first3' | 'always'
export type IllustMode = 'pause' | 'show' | 'skip'
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
  /** 欧文の語/分 */
  wpm: number
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
  /** 挿絵の位置に来たとき: 止まる／決まった秒数だけ表示／飛ばす */
  illustMode: IllustMode
  illustSeconds: number
  /** 論文などの参考文献の節を高速読書で飛ばす */
  skipReferences: boolean
  /** 画面の言語。auto は端末の言語に合わせる */
  uiLang: 'auto' | 'ja' | 'en'
  /** 自分の写真の壁紙を使う（写真そのものは wallpaper.ts で別に保存する） */
  wallpaperOn: boolean
  /** 壁紙の上に重ねる地の色の濃さ（0〜0.9）。大きいほど文字が読みやすい */
  wallpaperDim: number
  /** 壁紙のぼかし（px） */
  wallpaperBlur: number
  /** 強調色（空なら配色ごとの色） */
  accent: string
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
  wpm: 250,
  pauses: true,
  pauseScale: 1,
  rampUp: true,
  showContext: true,
  showProgressWhilePlaying: true,
  personColors: true,
  personLabel: 'chapter3',
  nameBoost: true,
  illustMode: 'pause',
  illustSeconds: 4,
  skipReferences: true,
  uiLang: 'auto',
  wallpaperOn: false,
  wallpaperDim: 0.55,
  wallpaperBlur: 4,
  accent: '',
}

export interface ThemeDef {
  id: Theme
  label: string
  /** 地の色（質感のある背景では、模様の下に敷く色） */
  bg: string
  fg: string
  accent: string
  dark: boolean
  /** CSS で模様を描く背景（本棚にも同じ背景を使う） */
  art?: boolean
}

export const THEMES: ThemeDef[] = [
  { id: 'paper', label: '紙', bg: '#f3f0e8', fg: '#1f1d1a', accent: '#b5482f', dark: false },
  { id: 'washi', label: '和紙', bg: '#eee7d8', fg: '#1e1b16', accent: '#b0402a', dark: false, art: true },
  { id: 'parchment', label: '羊皮紙', bg: '#e8d6a8', fg: '#3a2a16', accent: '#8a3b1c', dark: false, art: true },
  { id: 'night', label: '夜空', bg: '#0b1430', fg: '#f1ece2', accent: '#f0b95a', dark: true, art: true },
  { id: 'aurora', label: 'オーロラ', bg: '#07080d', fg: '#eceaf6', accent: '#a7b8ff', dark: true, art: true },
  { id: 'sakura', label: '桜', bg: '#f7e9ec', fg: '#2a1d21', accent: '#c2456b', dark: false, art: true },
  { id: 'forest', label: '森', bg: '#10201a', fg: '#e8efe6', accent: '#9bd17a', dark: true, art: true },
  { id: 'ocean', label: '海', bg: '#08243a', fg: '#e6f1f7', accent: '#5fd0e0', dark: true, art: true },
  { id: 'light', label: '白', bg: '#fbfaf7', fg: '#1b1b1b', accent: '#b5482f', dark: false },
  { id: 'sepia', label: 'セピア', bg: '#f1e7d0', fg: '#3b2f1e', accent: '#b5482f', dark: false },
  { id: 'gray', label: 'グレー', bg: '#3a3d42', fg: '#e8e6e1', accent: '#e07a5f', dark: true },
  { id: 'dark', label: '黒', bg: '#1d1f24', fg: '#e9e5dc', accent: '#e07a5f', dark: true },
  { id: 'black', label: '真っ黒', bg: '#000000', fg: '#c9c5bc', accent: '#e07a5f', dark: true },
]

export function themeOf(id: Theme): ThemeDef {
  return THEMES.find((t) => t.id === id) ?? THEMES[0]
}

const KEY = 'settings'
let cache: Settings | null = null
const listeners = new Set<(s: Settings) => void>()

/** 画面の言語を設定に合わせる。設定の変更を知らせる前に呼ぶので、再描画で新しい言語になる */
function applyUiLang(s: Settings) {
  setUiLang(s.uiLang === 'auto' ? detectLang() : s.uiLang)
}

export async function loadSettings(): Promise<Settings> {
  if (cache) return cache
  try {
    const saved = await getKV<Partial<Settings>>(KEY)
    cache = { ...DEFAULT_SETTINGS, ...(saved ?? {}) }
    applyUiLang(cache)
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
    applyUiLang(next)
    listeners.forEach((l) => l(next))
    setKV(KEY, next).catch(() => {})
  }, [])
  return [settings, update] as const
}

/** 選べる強調色（空は配色ごとの色） */
export const ACCENTS = ['', '#b5482f', '#c2456b', '#d98a1c', '#2f8f5b', '#2f6f8f', '#5b5bd6', '#8a4fbf']
