// 英語学習の練習：構造の単位を 1 つずつ流して読む・音読して採点する・文を画像にして保存や共有をする。

import { useEffect, useMemo, useRef, useState } from 'react'
import { appName, t } from '../lib/i18n'
import type { Role, Sentence } from '../lib/study'
import { flowUnits, layoutParts, scoreReading, unitMs } from '../lib/studyTools'
import { Icon, toast } from './common'
import { roleName, speak } from './StudyParts'

const WPM_KEY = 'flowa.study.wpm'

function loadWpm(): number {
  try {
    const v = Number(localStorage.getItem(WPM_KEY))
    return v >= 60 && v <= 600 ? v : 150
  } catch {
    return 150
  }
}

/** 構造の単位（S・V・O…）を画面の中央に 1 つずつ出す。返り読みせず前から読む練習 */
export function FlowView({ sentences, onClose }: { sentences: Sentence[]; onClose: () => void }) {
  const units = useMemo(() => flowUnits(sentences), [sentences])
  const [i, setI] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [wpm, setWpm] = useState(loadWpm)
  const done = i >= units.length

  useEffect(() => {
    try {
      localStorage.setItem(WPM_KEY, String(wpm))
    } catch {
      // 保存できなくても、今の練習は続けられる
    }
  }, [wpm])

  useEffect(() => {
    if (!playing || done) return
    const id = window.setTimeout(() => setI((n) => n + 1), unitMs(units[i], wpm))
    return () => window.clearTimeout(id)
  }, [playing, i, wpm, units, done])

  const u = units[Math.min(i, units.length - 1)]
  return (
    <div className="study-flow" role="dialog" aria-label={t('流して読む')}>
      <div className="row">
        <button className="icon-btn" aria-label={t('閉じる')} onClick={onClose}>
          <Icon name="close" />
        </button>
        <div className="grow small muted" style={{ textAlign: 'center' }}>
          {Math.min(i + 1, units.length)} / {units.length}
        </div>
        <div style={{ width: 44 }} />
      </div>
      <div className="progress" aria-hidden="true">
        <div style={{ width: `${(Math.min(i, units.length) / units.length) * 100}%` }} />
      </div>

      {done ? (
        <div className="study-flow-end stack">
          <div className="small muted">{t('訳')}</div>
          {sentences.map((s, k) => (
            <div key={k}>{s.ja}</div>
          ))}
        </div>
      ) : (
        <button className="study-flow-stage" onClick={() => setPlaying((p) => !p)} aria-label={playing ? t('一時停止') : t('再生')}>
          <span className={`study-flow-unit role-${u.role}`} lang="en">
            <span className="study-flow-text">{u.text}</span>
            <span className="study-label">
              {u.role === 'X' ? '' : u.sub ? u.role.toLowerCase() : u.role} {roleName(u.role)}
            </span>
          </span>
        </button>
      )}

      <div className="row study-flow-controls">
        <button className="icon-btn" aria-label={t('最初から')} onClick={() => setI(0)}>
          <Icon name="restart" />
        </button>
        <button className="icon-btn" aria-label={t('1つ戻る')} onClick={() => setI((n) => Math.max(0, Math.min(n, units.length) - 1))}>
          <Icon name="prev" />
        </button>
        <button
          className="btn primary"
          onClick={() => {
            if (done) setI(0)
            setPlaying((p) => (done ? true : !p))
          }}
        >
          <Icon name={playing && !done ? 'pause' : 'play'} />
        </button>
        <button className="icon-btn" aria-label={t('1つ進む')} onClick={() => setI((n) => Math.min(units.length, n + 1))}>
          <Icon name="next" />
        </button>
        <div className="grow" />
        <button className="btn small" aria-label={t('遅くする')} onClick={() => setWpm((w) => Math.max(60, w - 20))}>
          −
        </button>
        <span className="small" style={{ minWidth: 64, textAlign: 'center' }}>
          {t('{n} 語/分', { n: wpm })}
        </span>
        <button className="btn small" aria-label={t('速くする')} onClick={() => setWpm((w) => Math.min(600, w + 20))}>
          +
        </button>
      </div>
    </div>
  )
}

// ---- 音読練習 ----

interface Recognition {
  lang: string
  interimResults: boolean
  continuous: boolean
  start(): void
  stop(): void
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onerror: ((e: { error: string }) => void) | null
  onend: (() => void) | null
}

function recognitionClass(): (new () => Recognition) | null {
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export function ReadAloudSheet({ sentence, onClose, onScore }: { sentence: Sentence; onClose: () => void; onScore?: (score: number) => void }) {
  const [listening, setListening] = useState(false)
  const [heard, setHeard] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const rec = useRef<Recognition | null>(null)
  const Rec = recognitionClass()
  const result = heard !== null ? scoreReading(sentence.en, heard) : null

  useEffect(() => () => rec.current?.stop(), [])

  const start = () => {
    if (!Rec) return
    setErr(null)
    setHeard(null)
    const r = new Rec()
    r.lang = 'en-US'
    r.interimResults = false
    r.continuous = false
    let text = ''
    r.onresult = (e) => {
      text = Array.from(e.results)
        .map((x) => x[0]?.transcript ?? '')
        .join(' ')
    }
    r.onerror = (e) => setErr(e.error === 'not-allowed' ? t('マイクの使用が許可されていません。') : t('聞き取れませんでした。もう一度試してください。'))
    r.onend = () => {
      setListening(false)
      setHeard(text)
      if (text) onScore?.(scoreReading(sentence.en, text).score)
    }
    rec.current = r
    r.start()
    setListening(true)
  }

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet stack" role="dialog" aria-label={t('音読練習')}>
        <div className="row">
          <div className="grow" style={{ fontWeight: 700, fontSize: 17 }}>
            {t('音読練習')}
          </div>
          <button className="icon-btn" aria-label={t('閉じる')} onClick={onClose}>
            <Icon name="close" />
          </button>
        </div>
        <div lang="en" style={{ fontSize: 19, lineHeight: 1.5 }}>
          {result ? (
            result.words.map((w, k) => (
              <span key={k} className={w.ok ? 'study-said' : 'study-missed'}>
                {w.word}{' '}
              </span>
            ))
          ) : (
            sentence.en
          )}
        </div>
        {result && (
          <div className="study-score">
            {t('{n} 点', { n: result.score })}
            <span className="small muted"> {t('赤い語は聞き取れませんでした')}</span>
          </div>
        )}
        {heard !== null && (
          <div className="small muted" lang="en">
            {t('聞き取った文')}: {heard || '—'}
          </div>
        )}
        {err && <div className="notice error">{err}</div>}
        {!Rec && <div className="notice warn">{t('このブラウザは音声の聞き取りに対応していません。')}</div>}
        <div className="row wrap">
          <button className="btn small" onClick={() => speak(sentence.en, 0.9)}>
            <Icon name="play" />
            {t('お手本を聞く')}
          </button>
          {listening ? (
            <button className="btn danger" onClick={() => rec.current?.stop()}>
              {t('聞き取りを終える')}
            </button>
          ) : (
            <button className="btn primary" disabled={!Rec} onClick={start}>
              {t('読み上げを始める')}
            </button>
          )}
        </div>
        {listening && <div className="small">{t('聞いています… 読み終えたら少し待ってください')}</div>}
        <p className="small muted" style={{ margin: 0 }}>
          {t('聞き取りはブラウザの音声認識を使います。端末によっては音声が外部のサービスで処理されます。')}
        </p>
      </div>
    </>
  )
}

// ---- 画像で保存・共有 ----

const ROLE_COLORS: Record<Role, string> = { S: '#2b6cd9', V: '#d6343c', O: '#1e9152', C: '#8b3fc6', M: '#8a8a8e', X: '#000000' }

/** 文を 1 枚の画像（PNG）に描く */
export async function sentenceImage(s: Sentence): Promise<Blob> {
  const W = 1080
  const PAD = 72
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas')
  const enFont = '600 46px -apple-system, "Helvetica Neue", Arial, sans-serif'
  const labelFont = '700 26px -apple-system, "Helvetica Neue", Arial, sans-serif'
  const jaFont = '34px "Hiragino Sans", "Noto Sans JP", sans-serif'
  ctx.font = enFont
  const lines = layoutParts(s.parts, (x) => ctx.measureText(x).width, W - PAD * 2, 26)
  // 日本語訳を幅で折り返す
  ctx.font = jaFont
  const jaLines: string[] = []
  let cur = ''
  for (const ch of s.ja) {
    if (ctx.measureText(cur + ch).width > W - PAD * 2) {
      jaLines.push(cur)
      cur = ch
    } else cur += ch
  }
  if (cur) jaLines.push(cur)
  const LINE = 110
  const H = PAD + 70 + lines.length * LINE + 30 + jaLines.length * 52 + 90 + PAD
  canvas.width = W
  canvas.height = H
  ctx.fillStyle = '#fbfaf7'
  ctx.fillRect(0, 0, W, H)
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = '#6e6e73'
  ctx.font = labelFont
  ctx.fillText(s.pattern === 'other' ? '' : s.pattern, PAD, PAD + 26)
  let y = PAD + 70 + 46
  for (const line of lines) {
    for (const seg of line) {
      const color = ROLE_COLORS[seg.role]
      ctx.font = enFont
      ctx.fillStyle = '#1c1c1e'
      ctx.fillText(seg.text, PAD + seg.x, y)
      if (seg.role !== 'X') {
        ctx.fillStyle = color
        ctx.fillRect(PAD + seg.x, y + 12, seg.width, 5)
        ctx.font = labelFont
        ctx.textAlign = 'center'
        ctx.fillText(seg.role, PAD + seg.x + seg.width / 2, y + 46)
        ctx.textAlign = 'left'
      }
    }
    y += LINE
  }
  y += 10
  ctx.font = jaFont
  ctx.fillStyle = '#3a3a3c'
  for (const l of jaLines) {
    ctx.fillText(l, PAD, y)
    y += 52
  }
  ctx.font = labelFont
  ctx.fillStyle = '#a0a0a6'
  ctx.textAlign = 'right'
  ctx.fillText(appName(), W - PAD, H - PAD + 20)
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('png'))), 'image/png'))
}

/** 共有シートを出す。使えなければ画像ファイルとして保存する */
export async function shareSentence(s: Sentence) {
  const blob = await sentenceImage(s)
  const file = new File([blob], 'sentence.png', { type: 'image/png' })
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
  if (nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], text: s.en })
      return
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return
    }
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'sentence.png'
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 5000)
  toast(t('画像を保存しました'))
}
