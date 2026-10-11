import { useEffect, useState } from 'react'
import { requestPersist, storageInfo } from '../lib/db'
import { CHUNK_MODES } from '../lib/segment'
import { DEFAULT_SETTINGS, THEMES, useSettings } from '../lib/settings'
import { CPM_MAX, CPM_MIN, SPEED_PRESETS } from '../lib/timing'
import { formatBytes, go, Icon, toast } from './common'

export function SettingsScreen() {
  const [s, update] = useSettings()
  const [storage, setStorage] = useState<{ usage: number; quota: number; persisted: boolean } | null>(null)
  useEffect(() => {
    storageInfo().then(setStorage).catch(() => {})
  }, [])
  const theme = THEMES.find((t) => t.id === s.theme)!

  return (
    <div className="screen">
      <header className="topbar">
        <button className="icon-btn" aria-label="戻る" onClick={() => history.length > 1 ? history.back() : go('/')}>
          <Icon name="back" />
        </button>
        <h1>読書設定</h1>
      </header>

      <div className="preview-box" style={{ background: theme.bg, color: theme.fg, fontFamily: s.font === 'mincho' ? 'var(--font-mincho)' : 'var(--font-gothic)', fontSize: Math.min(s.fontSize, 40) }}>
        川沿いの道を
      </div>

      <div className="section-title">速度</div>
      <div className="card stack">
        <div className="segmented" role="group">
          {SPEED_PRESETS.map((p) => (
            <button key={p.cpm} aria-pressed={s.cpm === p.cpm} onClick={() => update({ cpm: p.cpm })}>
              {p.label}
            </button>
          ))}
        </div>
        <label className="field">
          <div className="label">
            <span>文字/分</span>
            <span>{s.cpm}</span>
          </div>
          <input type="number" inputMode="numeric" min={CPM_MIN} max={CPM_MAX} value={s.cpm} onChange={(e) => update({ cpm: Math.max(CPM_MIN, Math.min(CPM_MAX, Number(e.target.value) || DEFAULT_SETTINGS.cpm)) })} />
        </label>
        <p className="small muted" style={{ margin: 0 }}>
          速度は「空白を除いた文字数 ÷ 表示時間」で決めています。句読点の間を入れても、本全体の平均が設定値と一致するように各単位の表示時間を配分します。日本語の黙読は一般に毎分400〜600字程度と言われます。
        </p>
        <label className="switch">
          <span>句読点・段落末で間をとる</span>
          <input type="checkbox" checked={s.pauses} onChange={(e) => update({ pauses: e.target.checked })} />
        </label>
        {s.pauses && (
          <label className="field">
            <div className="label">
              <span>間の長さ</span>
              <span>×{s.pauseScale.toFixed(1)}</span>
            </div>
            <input type="range" min={0.5} max={2.5} step={0.1} value={s.pauseScale} onChange={(e) => update({ pauseScale: Number(e.target.value) })} />
          </label>
        )}
        <label className="switch">
          <span>
            再生直後をゆっくり始める
            <br />
            <span className="small muted">最初の4単位だけ表示時間を長くします</span>
          </span>
          <input type="checkbox" checked={s.rampUp} onChange={(e) => update({ rampUp: e.target.checked })} />
        </label>
      </div>

      <div className="section-title">分割</div>
      <div className="card stack">
        <ul className="list">
          {CHUNK_MODES.map((m) => (
            <li key={m.id}>
              <label className="switch">
                <span>
                  {m.label}
                  <br />
                  <span className="small muted">{m.hint}</span>
                </span>
                <input type="radio" name="mode" checked={s.mode === m.id} onChange={() => update({ mode: m.id })} />
              </label>
            </li>
          ))}
        </ul>
        <div className="field">
          <div className="label">最小の字数（これより短い単位は隣とつなぐ）</div>
          <div className="segmented" role="group">
            {[1, 2, 3, 4].map((n) => (
              <button key={n} aria-pressed={s.minChars === n} onClick={() => update({ minChars: n })}>
                {n === 1 ? 'なし' : `${n}字以上`}
              </button>
            ))}
          </div>
        </div>
        {s.mode === 'phrase' && (
          <label className="field">
            <div className="label">
              <span>フレーズの目標文字数</span>
              <span>{s.phraseTarget}文字</span>
            </div>
            <input type="range" min={4} max={14} value={s.phraseTarget} onChange={(e) => update({ phraseTarget: Number(e.target.value) })} />
          </label>
        )}
      </div>

      <div className="section-title">表示</div>
      <div className="card stack">
        <div className="field">
          <div className="label">配色</div>
          <div className="row wrap">
            {THEMES.map((t) => (
              <button
                key={t.id}
                className="btn small"
                aria-pressed={s.theme === t.id}
                style={{ background: t.bg, color: t.fg, borderColor: s.theme === t.id ? 'var(--accent)' : 'var(--line)', borderWidth: 2 }}
                onClick={() => update({ theme: t.id })}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <label className="field">
          <div className="label">
            <span>文字サイズ（上限）</span>
            <span>{s.fontSize}px</span>
          </div>
          <input type="range" min={20} max={120} step={2} value={s.fontSize} onChange={(e) => update({ fontSize: Number(e.target.value) })} />
        </label>
        <p className="small muted" style={{ margin: 0 }}>
          長い単位は、画面に収まるように自動で小さく表示します。
        </p>
        <div className="field">
          <div className="label">書体</div>
          <div className="segmented" role="group">
            <button aria-pressed={s.font === 'mincho'} onClick={() => update({ font: 'mincho' })}>
              明朝
            </button>
            <button aria-pressed={s.font === 'gothic'} onClick={() => update({ font: 'gothic' })}>
              ゴシック
            </button>
          </div>
        </div>
        <div className="field">
          <div className="label">文字の向き</div>
          <div className="segmented" role="group">
            <button aria-pressed={s.direction === 'horizontal'} onClick={() => update({ direction: 'horizontal' })}>
              横書き
            </button>
            <button aria-pressed={s.direction === 'vertical'} onClick={() => update({ direction: 'vertical' })}>
              縦書き
            </button>
          </div>
        </div>
        <div className="field">
          <div className="label">視線のガイド</div>
          <div className="segmented" role="group">
            <button aria-pressed={s.guide === 'none'} onClick={() => update({ guide: 'none' })}>
              なし
            </button>
            <button aria-pressed={s.guide === 'center'} onClick={() => update({ guide: 'center' })}>
              中央の目印
            </button>
            <button aria-pressed={s.guide === 'focus'} onClick={() => update({ guide: 'focus' })}>
              注視点を強調
            </button>
          </div>
          <p className="small muted">「注視点を強調」は、単位の前から約3分の1の文字に色を付け、その文字を画面中央に置きます。はみ出す場合は中央寄せを優先します。</p>
        </div>
        <label className="switch">
          <span>登録した人物名を色分け</span>
          <input type="checkbox" checked={s.personColors} onChange={(e) => update({ personColors: e.target.checked })} />
        </label>
        <label className="switch">
          <span>人物名を含む単位を少し長く表示</span>
          <input type="checkbox" checked={s.nameBoost} onChange={(e) => update({ nameBoost: e.target.checked })} />
        </label>
        <label className="switch">
          <span>一時停止中に全文パネルを表示</span>
          <input type="checkbox" checked={s.showContext} onChange={(e) => update({ showContext: e.target.checked })} />
        </label>
        <label className="switch">
          <span>再生中も進捗と残り時間を表示</span>
          <input type="checkbox" checked={s.showProgressWhilePlaying} onChange={(e) => update({ showProgressWhilePlaying: e.target.checked })} />
        </label>
      </div>

      <div className="section-title">キーボード操作</div>
      <div className="card small">
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            {[
              ['Space / Enter', '再生・一時停止'],
              ['← / →', '1単位戻る・進む'],
              ['↑ / ↓（Shift+←→）', '前・次の段落'],
              ['+ / −', '速度を50字/分ずつ変える'],
              ['[ / ]', '文字サイズ'],
              ['T', '配色を切り替え'],
              ['P', '元のPDFを見る'],
              ['Home', '最初から読む'],
              ['Esc', '一時停止・本棚へ戻る'],
            ].map(([k, v]) => (
              <tr key={k}>
                <td style={{ padding: '4px 0', whiteSpace: 'nowrap', fontWeight: 600 }}>{k}</td>
                <td className="muted">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="section-title">保存データ</div>
      <div className="card stack small">
        {storage ? (
          <div>
            使用量 {formatBytes(storage.usage)}
            {storage.quota > 0 && ` / 上限の目安 ${formatBytes(storage.quota)}`}
            <br />
            {storage.persisted ? '自動削除されない設定になっています。' : 'ブラウザの判断で、長く使っていないデータが消される可能性があります。'}
          </div>
        ) : (
          <div className="muted">容量を取得できませんでした。</div>
        )}
        {storage && !storage.persisted && (
          <button
            className="btn small"
            onClick={async () => {
              const ok = await requestPersist()
              toast(ok ? '保存データを保護しました' : 'ブラウザに許可されませんでした。ホーム画面に追加すると保護されやすくなります。')
              setStorage(await storageInfo())
            }}
          >
            保存データを保護するよう依頼する
          </button>
        )}
        <p className="muted" style={{ margin: 0 }}>
          iPhoneのSafariでは、ホーム画面に追加していないサイトのデータは、7日間使わないと削除されることがあります。長編を読むときは「共有 → ホーム画面に追加」で起動してください。
        </p>
        <button className="btn small" onClick={() => update({ ...DEFAULT_SETTINGS })}>
          読書設定を初期値に戻す
        </button>
      </div>
    </div>
  )
}
