// 画面の下のタブ（iPhone のタブバー）。本棚・メモ・記録・設定を行き来する。読書画面などでは出さない。

import { t } from '../lib/i18n'
import { go, Icon } from './common'

const TABS = [
  { path: '/', screen: '', icon: 'book', label: () => t('本棚') },
  { path: '/notes', screen: 'notes', icon: 'highlighter', label: () => t('メモ') },
  { path: '/history', screen: 'history', icon: 'chart', label: () => t('記録') },
  { path: '/settings', screen: 'settings', icon: 'settings', label: () => t('設定') },
] as const

export const TAB_SCREENS: string[] = TABS.map((x) => x.screen)

export function TabBar({ screen }: { screen: string }) {
  return (
    <nav className="tabbar" aria-label={t('画面の切り替え')}>
      {TABS.map((tab) => {
        const on = tab.screen === screen
        return (
          <button key={tab.path} className={on ? 'on' : ''} aria-current={on ? 'page' : undefined} onClick={() => !on && go(tab.path)}>
            <Icon name={tab.icon} />
            <span>{tab.label()}</span>
          </button>
        )
      })}
    </nav>
  )
}
