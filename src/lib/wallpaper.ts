// 自分の写真を壁紙にする。写真は端末の中（IndexedDB）にだけ保存し、外部には送らない。
// 容量を抑えるため、長辺 1600px の JPEG に縮めてから保存する。

import { useEffect, useState } from 'react'
import { getKV, setKV } from './db'
import { t } from './i18n'

const KEY = 'wallpaper'
const LONG_SIDE = 1600

let cache: string | null | undefined
const listeners = new Set<(url: string | null) => void>()

function notify(url: string | null) {
  cache = url
  listeners.forEach((l) => l(url))
}

export async function loadWallpaper(): Promise<string | null> {
  if (cache !== undefined) return cache
  cache = (await getKV<string>(KEY).catch(() => undefined)) ?? null
  return cache
}

/** 画像ファイルを縮めて保存する */
export async function saveWallpaper(file: File): Promise<void> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = () => reject(new Error(t('画像を読み込めませんでした。別の写真を選んでください。')))
      i.src = url
    })
    const scale = Math.min(1, LONG_SIDE / Math.max(img.naturalWidth, img.naturalHeight))
    const c = document.createElement('canvas')
    c.width = Math.round(img.naturalWidth * scale)
    c.height = Math.round(img.naturalHeight * scale)
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
    const data = c.toDataURL('image/jpeg', 0.82)
    c.width = c.height = 0
    await setKV(KEY, data)
    notify(data)
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function clearWallpaper(): Promise<void> {
  await setKV(KEY, null)
  notify(null)
}

export function useWallpaper(): string | null {
  const [url, setUrl] = useState<string | null>(cache ?? null)
  useEffect(() => {
    let alive = true
    loadWallpaper().then((u) => alive && setUrl(u))
    listeners.add(setUrl)
    return () => {
      alive = false
      listeners.delete(setUrl)
    }
  }, [])
  return url
}
