import { History } from './ui/History'
import { Import } from './ui/Import'
import { Library } from './ui/Library'
import { Ocr } from './ui/Ocr'
import { PdfViewer } from './ui/PdfViewer'
import { Reader } from './ui/Reader'
import { SettingsScreen } from './ui/SettingsScreen'
import { ToastHost, useRoute } from './ui/common'
import { useEffect } from 'react'
import { themeOf, useSettings } from './lib/settings'
import { useWallpaper } from './lib/wallpaper'

export default function App() {
  const { parts, query } = useRoute()
  const [settings] = useSettings()
  // 質感のある背景を選んだときは、本棚などの画面にも同じ背景を使う
  const wallpaper = useWallpaper()
  // 自分の写真の壁紙と強調色を、本棚・読書画面の両方に使う
  useEffect(() => {
    const t = themeOf(settings.theme)
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
    if (settings.accent) root.style.setProperty('--accent', settings.accent)
    else root.style.removeProperty('--accent')
  }, [settings.theme, settings.wallpaperOn, settings.wallpaperDim, settings.wallpaperBlur, settings.accent, wallpaper])
  useEffect(() => {
    const t = themeOf(settings.theme)
    const root = document.documentElement
    if (t.art) root.dataset.theme = t.id
    else delete root.dataset.theme
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t.art ? t.bg : '#1d1f24')
  }, [settings.theme])
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
      view = <Reader key={`${id}-${p ?? ''}`} id={id} startPage={p !== undefined ? p - 1 : undefined} />
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
    default:
      view = <Library />
  }
  return (
    <>
      {view}
      <ToastHost />
    </>
  )
}
