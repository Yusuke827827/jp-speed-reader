// 設定画面の「壁紙」。自分の写真を選び、暗さとぼかしを調整する。写真は端末の中にだけ保存する。

import { useRef, useState } from 'react'
import { t } from '../lib/i18n'
import { useSettings } from '../lib/settings'
import { clearWallpaper, saveWallpaper, useWallpaper } from '../lib/wallpaper'
import { toast } from './common'

export function WallpaperField() {
  const [s, update] = useSettings()
  const wallpaper = useWallpaper()
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  const pick = async (file: File) => {
    setBusy(true)
    try {
      await saveWallpaper(file)
      update({ wallpaperOn: true })
    } catch {
      toast(t('画像を読み込めませんでした。別の写真を選んでください。'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="field">
      <div className="label">{t('壁紙（自分の写真）')}</div>
      <div className="row wrap">
        {wallpaper && <div className="wallpaper-thumb" style={{ backgroundImage: `url("${wallpaper}")` }} aria-hidden="true" />}
        <button className="btn small" disabled={busy} onClick={() => input.current?.click()}>
          {wallpaper ? t('写真を変える') : t('写真を選ぶ')}
        </button>
        {wallpaper && (
          <button
            className="btn small danger"
            onClick={async () => {
              await clearWallpaper()
              update({ wallpaperOn: false })
            }}
          >
            {t('外す')}
          </button>
        )}
        <input
          ref={input}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (f) pick(f)
          }}
        />
      </div>
      {wallpaper && (
        <>
          <label className="switch">
            <span>{t('壁紙を使う')}</span>
            <input type="checkbox" checked={s.wallpaperOn} onChange={(e) => update({ wallpaperOn: e.target.checked })} />
          </label>
          <label className="field">
            <div className="label">
              <span>{t('文字を読みやすくする（壁紙を薄くする）')}</span>
              <span>{Math.round(s.wallpaperDim * 100)}%</span>
            </div>
            <input type="range" min={0} max={0.9} step={0.05} value={s.wallpaperDim} onChange={(e) => update({ wallpaperDim: Number(e.target.value) })} />
          </label>
          <label className="field">
            <div className="label">
              <span>{t('ぼかし')}</span>
              <span>{s.wallpaperBlur}px</span>
            </div>
            <input type="range" min={0} max={20} step={1} value={s.wallpaperBlur} onChange={(e) => update({ wallpaperBlur: Number(e.target.value) })} />
          </label>
        </>
      )}
      <p className="small muted" style={{ margin: 0 }}>
        {t('写真はこの端末の中にだけ保存され、外部には送られません。文字の色は「配色」の明るさに合わせます。')}
      </p>
    </div>
  )
}
