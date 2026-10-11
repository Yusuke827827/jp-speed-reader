import { History } from './ui/History'
import { Import } from './ui/Import'
import { Library } from './ui/Library'
import { Ocr } from './ui/Ocr'
import { PdfViewer } from './ui/PdfViewer'
import { Reader } from './ui/Reader'
import { SettingsScreen } from './ui/SettingsScreen'
import { ToastHost, useRoute } from './ui/common'

export default function App() {
  const { parts, query } = useRoute()
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
