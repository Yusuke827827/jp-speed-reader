// 初めて開いたときの案内。3 枚を順にめくり、最後にサンプルを試すか始めるかを選ぶ。設定の使い方からもう一度開ける。

import { useState } from 'react'
import { t } from '../lib/i18n'
import { isStandalone } from '../lib/resume'
import { go, Icon } from './common'

const PAGES = [
  { icon: 'fileAdd', title: () => t('小説を取り込む'), body: () => t('PDF・EPUB・テキストを選ぶと、本文を取り出して本棚に並べます。本はこの端末の中だけに保存し、外部には送りません。') },
  { icon: 'play', title: () => t('画面の中央で読む'), body: () => t('文節ごとに画面の中央へ表示します。中央をタップすると再生と一時停止、下の「−」「＋」で速さを変えます。') },
  { icon: 'plus', home: true, title: () => t('ホーム画面に追加する'), body: () => t('iPhoneでは、Safariの「共有」から「ホーム画面に追加」を選んでください。アプリのように開け、取り込んだ本も消えにくくなります。') },
] as const

export function Intro({ onClose }: { onClose: () => void }) {
  // すでにホーム画面から開いているなら、ホーム画面に追加する案内は出さない
  const [pages] = useState(() => PAGES.filter((p) => !('home' in p) || !isStandalone()))
  const [i, setI] = useState(0)
  const p = pages[i]
  const last = i === pages.length - 1
  return (
    <div className="intro" role="dialog" aria-modal="true" aria-label={t('はじめに')}>
      <button className="intro-skip" onClick={onClose}>
        {t('スキップ')}
      </button>
      <div className="intro-body" key={i}>
        <div className="intro-icon" aria-hidden="true">
          <Icon name={p.icon} />
        </div>
        <h2>{p.title()}</h2>
        <p>{p.body()}</p>
      </div>
      <div className="intro-dots" role="img" aria-label={t('{i}枚目／{n}枚', { i: i + 1, n: pages.length })}>
        {pages.map((_, k) => (
          <span key={k} className={k === i ? 'on' : ''} />
        ))}
      </div>
      <div className="intro-actions">
        {last ? (
          <>
            <button
              className="btn primary wide"
              onClick={() => {
                onClose()
                go('/import')
              }}
            >
              {t('サンプルで試す')}
            </button>
            <button className="btn ghost wide" onClick={onClose}>
              {t('はじめる')}
            </button>
          </>
        ) : (
          <button className="btn primary wide" onClick={() => setI(i + 1)}>
            {t('次へ')}
          </button>
        )}
      </div>
    </div>
  )
}
