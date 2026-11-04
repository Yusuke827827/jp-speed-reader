import { History } from './ui/History'
import { Import } from './ui/Import'
import { Library } from './ui/Library'
import { Ocr } from './ui/Ocr'
import { PdfViewer } from './ui/PdfViewer'
import { Reader } from './ui/Reader'
import { SettingsScreen } from './ui/SettingsScreen'
import { AllNotes } from './ui/AllNotes'
import { TabBar, TAB_SCREENS } from './ui/TabBar'
import { go, ToastHost, useRoute } from './ui/common'
import { useEffect } from 'react'
import { activeTheme, loadSettings, themeOf, useSettings, useSystemDark } from './lib/settings'
import { isStandalone, lastReadBookId, shouldResume } from './lib/resume'

// 起動したときの画面。ホーム画面から本棚が開いたときに、続きを開くかを決めるのに使う
const launchHash = location.hash
import { useWallpaper } from './lib/wallpaper'

/** 色の上に置く文字の色。明るさの差が大きい方（白か黒）を選ぶ */
function textOn(hex: string): string {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4))
  const l = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
  return 1.05 / (l + 0.05) >= (l + 0.05) / 0.05 ? '#ffffff' : '#111111'
}

export default function App() {
  const { parts, query } = useRoute()
  const [settings] = useSettings()
  const themeId = activeTheme(settings, useSystemDark())
  useEffect(() => {
    loadSettings().then(async (s) => {
      if (!shouldResume(launchHash, isStandalone(), s.resumeOnLaunch)) return
      const id = await lastReadBookId().catch(() => null)
      // 読み込みを待つ間に別の画面へ移っていたら、何もしない
      if (id && shouldResume(location.hash, true, true)) go(`/read/${id}`)
    })
  }, [])
  // 質感のある背景を選んだときは、本棚などの画面にも同じ背景を使う
  const wallpaper = useWallpaper()
  // 自分の写真の壁紙と強調色を、本棚・読書画面の両方に使う
  useEffect(() => {
    const t = themeOf(themeId)
    const root = document.documentElement
    const on = settings.wallpaperOn && !!wallpaper
    if (on) {
      root.dataset.wallpaper = t.dark ? 'dark' : 'light'
      root.style.setProperty('--wallpaper', `url("${wallpaper}")`)
      root.style.setProperty('--wp-dim', String(settings.wallpaperDim))
      root.style.setProperty('--wp-blur', `${settings.wallpaperBlur}px`)
      root.style.setProperty('--wp-tint', t.bg)
    } else {
      delete root.dataset.wallpaper
      root.style.removeProperty('--wallpaper')
    }
    if (settings.accent) {
      root.style.setProperty('--accent', settings.accent)
      root.style.setProperty('--accent-text', textOn(settings.accent))
    } else {
      root.style.removeProperty('--accent')
      root.style.removeProperty('--accent-text')
    }
  }, [themeId, settings.wallpaperOn, settings.wallpaperDim, settings.wallpaperBlur, settings.accent, wallpaper])
  useEffect(() => {
    const t = themeOf(themeId)
    const root = document.documentElement
    if (t.art) root.dataset.theme = t.id
    else delete root.dataset.theme
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t.art ? t.bg : '#1d1f24')
  }, [themeId])
  const [screen, id] = parts
  const num = (k: string) => {
    const v = Number(query.get(k))
    return Number.isFinite(v) && v > 0 ? v : undefined
  }

  let view
  switch (screen) {
    case 'import':
      view = <Import />
      break
    case 'ocr':
      view = <Ocr key={id} id={id} garbled={num('garbled') ?? 0} />
      break
    case 'read': {
      const p = num('page')
      // メモの一覧から来たときは、印を付けた文の位置から開く
      const para = query.get('para')
      const startPos = para !== null ? { para: Number(para) || 0, offset: Number(query.get('offset')) || 0 } : undefined
      view = <Reader key={`${id}-${p ?? ''}-${para ?? ''}-${query.get('offset') ?? ''}`} id={id} startPage={p !== undefined ? p - 1 : undefined} startPos={startPos} />
      break
    }
    case 'pdf':
      view = <PdfViewer key={id} id={id} initialPage={(num('page') ?? 1) - 1} compare={query.get('compare') === '1'} fromReader={query.get('from') === 'read'} />
      break
    case 'settings':
      view = <SettingsScreen />
      break
    case 'history':
      view = <History />
      break
    case 'notes':
      view = <AllNotes />
      break
    default:
      view = <Library />
  }
  return (
    <>
      {view}
      {TAB_SCREENS.includes(screen ?? '') && <TabBar screen={screen ?? ''} />}
      <ToastHost />
    </>
  )
}
