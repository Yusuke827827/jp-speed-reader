// 画面の文言の多言語化。日本語の文をそのままキーにして t('本棚') のように使い、
// 英語では src/i18n/en の辞書の訳を返す（訳が無ければ日本語のまま）。
// 値の埋め込みは t('{done} / {total} ページ', { done, total }) のように {名前} で書く。

import en from '../i18n/en'

export type UiLang = 'ja' | 'en'

/** アプリ名。名前が決まったらここを変える */
export const APP_NAME = { ja: '速読リーダー', en: 'Speed Reader' } as const

const dictionaries: Record<UiLang, Record<string, string> | null> = { ja: null, en }

/** 端末の言語の一覧から、画面の言語を決める。日本語でなければ英語 */
export function detectLang(langs: readonly string[] = typeof navigator !== 'undefined' ? navigator.languages : []): UiLang {
  return langs[0]?.toLowerCase().startsWith('ja') ? 'ja' : 'en'
}

// ブラウザの外（テストなど）では日本語にする
let current: UiLang = typeof window === 'undefined' ? 'ja' : detectLang()

export function setUiLang(lang: UiLang) {
  current = lang
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lang
    document.title = APP_NAME[lang]
  }
}

export function uiLang(): UiLang {
  return current
}

export function t(ja: string, vars?: Record<string, string | number>): string {
  const s = dictionaries[current]?.[ja] ?? ja
  return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s
}

/** アプリ名（画面の言語に合わせる） */
export const appName = () => APP_NAME[current]
