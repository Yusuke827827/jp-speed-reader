// 設定画面の「書き出し・読み込み」。機種変更や PC との間で本棚と読書位置を移す。

import { useEffect, useRef, useState } from 'react'
import { applyRestore, backupFileName, collectBackup, packBackup, planRestore, unpackBackup, type Backup, type BackupMode, type BookAction } from '../lib/backup'
import { listBooks } from '../lib/db'
import { t } from '../lib/i18n'
import { formatBytes, Icon, toast } from './common'

/** iPhone では共有シート（「ファイル」に保存・AirDrop など）、PC ではダウンロードで渡す */
async function handOver(data: Uint8Array, name: string) {
  const file = new File([data as BlobPart], name, { type: 'application/zip' })
  const touch = window.matchMedia?.('(pointer: coarse)').matches
  if (touch && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] })
      return true
    } catch (e) {
      if ((e as Error).name === 'AbortError') return false
    }
  }
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60000)
  return true
}

export function BackupSection() {
  const [busy, setBusy] = useState<BackupMode | 'restore' | null>(null)
  const [fullSize, setFullSize] = useState(0)
  const [pending, setPending] = useState<{ backup: Backup; plan: BookAction[] } | null>(null)
  const [withSettings, setWithSettings] = useState(true)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    listBooks()
      .then((bs) => setFullSize(bs.reduce((n, b) => n + (b.fileSize || 0), 0)))
      .catch(() => {})
  }, [])

  const exportAs = async (mode: BackupMode) => {
    setBusy(mode)
    try {
      const zip = packBackup(await collectBackup(mode))
      if (await handOver(zip, backupFileName(mode))) toast(t('書き出しました（{size}）', { size: formatBytes(zip.byteLength) }))
    } catch (e) {
      toast(t('書き出せませんでした: {message}', { message: (e as Error).message }))
    } finally {
      setBusy(null)
    }
  }

  const open = async (file: File) => {
    setBusy('restore')
    try {
      const backup = unpackBackup(await file.arrayBuffer())
      setPending({ backup, plan: planRestore(backup, await listBooks()) })
    } catch {
      toast(t('このアプリで書き出したファイルではないか、壊れています。'))
    } finally {
      setBusy(null)
    }
  }

  const restore = async () => {
    if (!pending) return
    setBusy('restore')
    try {
      const r = await applyRestore(pending.backup, pending.plan, { settings: withSettings })
      setPending(null)
      toast(t('読み込みました（本の追加 {added}・位置の引き継ぎ {matched}）', { added: r.added, matched: r.matched }))
      // 設定や本棚を読み直すため、少し待ってから開き直す
      setTimeout(() => location.reload(), 1200)
    } catch (e) {
      toast(t('読み込めませんでした: {message}', { message: (e as Error).message }))
      setBusy(null)
    }
  }

  const count = (k: BookAction['kind']) => pending?.plan.filter((p) => p.kind === k).length ?? 0
  const missing = pending?.plan.filter((p) => p.kind === 'missing').map((p) => p.book.title) ?? []

  return (
    <>
      <ul className="list group">
        <li>
          <button disabled={busy !== null} onClick={() => exportAs('full')}>
            <Icon name="book" />
            <span className="grow">
              {t('本ごと全部を書き出す')}
              <span className="row-sub">{t('PDF・EPUBも含めます（約{size}）。新しい端末にそのまま移せます。', { size: formatBytes(fullSize) })}</span>
            </span>
            {busy === 'full' && <span className="small muted">{t('作成中…')}</span>}
          </button>
        </li>
        <li>
          <button disabled={busy !== null} onClick={() => exportAs('light')}>
            <Icon name="bookmark" />
            <span className="grow">
              {t('位置・メモ・設定だけを書き出す')}
              <span className="row-sub">{t('小さなファイルです。読み込む端末に、同じ本を先に取り込んでおいてください。')}</span>
            </span>
            {busy === 'light' && <span className="small muted">{t('作成中…')}</span>}
          </button>
        </li>
        <li>
          <button disabled={busy !== null} onClick={() => input.current?.click()}>
            <Icon name="plus" />
            <span className="grow">{t('書き出したファイルを読み込む')}</span>
          </button>
        </li>
      </ul>
      <p className="section-foot">{t('読み込んでも、この端末の本や記録は消えません。足し合わせて、新しい方の読書位置を残します。')}</p>
      <input
        ref={input}
        type="file"
        accept="application/zip,.zip"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          e.target.value = ''
          if (f) open(f)
        }}
      />

      {pending && (
        <>
          <div className="sheet-backdrop" onClick={() => busy === null && setPending(null)} />
          <div className="sheet stack" role="dialog" aria-label={t('書き出したファイルを読み込む')}>
            <div className="row">
              <div className="grow" style={{ fontWeight: 700, fontSize: 17 }}>
                {t('書き出したファイルを読み込む')}
              </div>
              <button className="icon-btn" aria-label={t('閉じる')} onClick={() => setPending(null)} disabled={busy !== null}>
                <Icon name="close" />
              </button>
            </div>
            <ul className="list group plain stats">
              <li>
                <span className="grow">{t('種類')}</span>
                <b>{pending.backup.mode === 'full' ? t('本ごと全部') : t('位置・メモ・設定だけ')}</b>
              </li>
              <li>
                <span className="grow">{t('書き出した日時')}</span>
                <b>{new Date(pending.backup.exportedAt).toLocaleString()}</b>
              </li>
              <li>
                <span className="grow">{t('この端末に足す本')}</span>
                <b>{count('add')}</b>
              </li>
              <li>
                <span className="grow">{t('位置とメモを引き継ぐ本')}</span>
                <b>{count('match')}</b>
              </li>
              {missing.length > 0 && (
                <li>
                  <span className="grow">{t('この端末に無い本')}</span>
                  <b>{missing.length}</b>
                </li>
              )}
            </ul>
            {missing.length > 0 && (
              <p className="small muted">
                {t('次の本はこの端末に無いため、位置とメモを引き継げません。先に取り込んでから、もう一度読み込んでください。')}
                <br />
                {missing.slice(0, 5).join('、')}
                {missing.length > 5 ? t('ほか{n}冊', { n: missing.length - 5 }) : ''}
              </p>
            )}
            <label className="switch">
              <span>{t('設定と壁紙も、書き出したときのものにする')}</span>
              <input type="checkbox" checked={withSettings} onChange={(e) => setWithSettings(e.target.checked)} />
            </label>
            <button className="btn primary" style={{ width: '100%' }} disabled={busy !== null || count('add') + count('match') === 0} onClick={restore}>
              {busy === 'restore' ? t('読み込み中…') : t('読み込む')}
            </button>
          </div>
        </>
      )}
    </>
  )
}
