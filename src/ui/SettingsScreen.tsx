import { useEffect, useState } from 'react'
import { requestPersist, storageInfo } from '../lib/db'
import { CHUNK_MODES } from '../lib/segment'
import { DEFAULT_SETTINGS, THEMES, useSettings } from '../lib/settings'
import { CPM_MAX, CPM_MIN, SPEED_PRESETS, WPM_MAX, WPM_MIN } from '../lib/timing'
import { t } from '../lib/i18n'
import { formatBytes, go, Icon, toast } from './common'

export function SettingsScreen() {
  const [s, update] = useSettings()
  const [storage, setStorage] = useState<{ usage: number; quota: number; persisted: boolean } | null>(null)
  useEffect(() => {
    storageInfo().then(setStorage).catch(() => {})
  }, [])
  const theme = THEMES.find((th) => th.id === s.theme)!

  return (
    <div className="screen">
      <header className="topbar">
        <button className="icon-btn" aria-label={t('戻る')} onClick={() => history.length > 1 ? history.back() : go('/')}>
          <Icon name="back" />
        </button>
        <h1>{t('読書設定')}</h1>
      </header>

      <div className={`preview-box bg-${theme.id}`} style={{ backgroundColor: theme.bg, color: theme.fg, fontFamily: s.font === 'mincho' ? 'var(--font-mincho)' : 'var(--font-gothic)', fontSize: Math.min(s.fontSize, 40) }}>
        {t('川沿いの道を')}
      </div>

      <div className="section-title">{t('全般')}</div>
      <div className="card stack">
        <div className="field">
          <div className="label">{t('画面の言語')}</div>
          <div className="segmented" role="group">
            {(
              [
                ['auto', t('自動（端末の言語）')],
                ['ja', t('日本語')],
                ['en', 'English'],
              ] as const
            ).map(([v, l]) => (
              <button key={v} aria-pressed={s.uiLang === v} onClick={() => update({ uiLang: v })}>
                {l}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="section-title">{t('速度')}</div>
      <div className="card stack">
        <div className="segmented" role="group">
          {SPEED_PRESETS.map((p) => (
            <button key={p.cpm} aria-pressed={s.cpm === p.cpm} onClick={() => update({ cpm: p.cpm })}>
              {t(p.label)}
            </button>
          ))}
        </div>
        <label className="field">
          <div className="label">
            <span>{t('文字/分')}</span>
            <span>{s.cpm}</span>
          </div>
          <input type="number" inputMode="numeric" min={CPM_MIN} max={CPM_MAX} value={s.cpm} onChange={(e) => update({ cpm: Math.max(CPM_MIN, Math.min(CPM_MAX, Number(e.target.value) || DEFAULT_SETTINGS.cpm)) })} />
        </label>
        <label className="field">
          <div className="label">
            <span>{t('英語など欧文の語/分（WPM）')}</span>
            <span>{s.wpm}</span>
          </div>
          <input type="number" inputMode="numeric" min={WPM_MIN} max={WPM_MAX} value={s.wpm} onChange={(e) => update({ wpm: Math.max(WPM_MIN, Math.min(WPM_MAX, Number(e.target.value) || DEFAULT_SETTINGS.wpm)) })} />
        </label>
        <p className="small muted" style={{ margin: 0 }}>
          {t('欧文（英語など）の文は語数で速度を合わせます。英語の黙読は一般に毎分200〜300語程度と言われます。')}
        </p>
        <p className="small muted" style={{ margin: 0 }}>
          {t('速度は「空白を除いた文字数 ÷ 表示時間」で決めています。句読点の間を入れても、本全体の平均が設定値と一致するように各単位の表示時間を配分します。日本語の黙読は一般に毎分400〜600字程度と言われます。')}
        </p>
        <label className="switch">
          <span>{t('句読点・段落末で間をとる')}</span>
          <input type="checkbox" checked={s.pauses} onChange={(e) => update({ pauses: e.target.checked })} />
        </label>
        {s.pauses && (
          <label className="field">
            <div className="label">
              <span>{t('間の長さ')}</span>
              <span>×{s.pauseScale.toFixed(1)}</span>
            </div>
            <input type="range" min={0.5} max={2.5} step={0.1} value={s.pauseScale} onChange={(e) => update({ pauseScale: Number(e.target.value) })} />
          </label>
        )}
        <label className="switch">
          <span>
            {t('再生直後をゆっくり始める')}
            <br />
            <span className="small muted">{t('最初の4単位だけ表示時間を長くします')}</span>
          </span>
          <input type="checkbox" checked={s.rampUp} onChange={(e) => update({ rampUp: e.target.checked })} />
        </label>
      </div>

      <div className="section-title">{t('分割')}</div>
      <div className="card stack">
        <ul className="list">
          {CHUNK_MODES.map((m) => (
            <li key={m.id}>
              <label className="switch">
                <span>
                  {t(m.label)}
                  <br />
                  <span className="small muted">{t(m.hint)}</span>
                </span>
                <input type="radio" name="mode" checked={s.mode === m.id} onChange={() => update({ mode: m.id })} />
              </label>
            </li>
          ))}
        </ul>
        <div className="field">
          <div className="label">{t('最小の字数（これより短い単位は隣とつなぐ）')}</div>
          <div className="segmented" role="group">
            {[1, 2, 3, 4].map((n) => (
              <button key={n} aria-pressed={s.minChars === n} onClick={() => update({ minChars: n })}>
                {n === 1 ? t('なし') : t('{n}字以上', { n })}
              </button>
            ))}
          </div>
        </div>
        {s.mode === 'phrase' && (
          <label className="field">
            <div className="label">
              <span>{t('フレーズの目標文字数')}</span>
              <span>{t('{n}文字', { n: s.phraseTarget })}</span>
            </div>
            <input type="range" min={4} max={14} value={s.phraseTarget} onChange={(e) => update({ phraseTarget: Number(e.target.value) })} />
          </label>
        )}
      </div>

      <div className="section-title">{t('表示')}</div>
      <div className="card stack">
        <div className="field">
          <div className="label">{t('配色')}</div>
          <div className="row wrap">
            {THEMES.map((th) => (
              <button
                key={th.id}
                className={`btn small bg-${th.id}`}
                aria-pressed={s.theme === th.id}
                style={{ background: th.bg, color: th.fg, borderColor: s.theme === th.id ? 'var(--accent)' : 'var(--line)', borderWidth: 2 }}
                onClick={() => update({ theme: th.id })}
              >
                {t(th.label)}
              </button>
            ))}
          </div>
        </div>
        <label className="field">
          <div className="label">
            <span>{t('文字サイズ（上限）')}</span>
            <span>{s.fontSize}px</span>
          </div>
          <input type="range" min={20} max={120} step={2} value={s.fontSize} onChange={(e) => update({ fontSize: Number(e.target.value) })} />
        </label>
        <p className="small muted" style={{ margin: 0 }}>
          {t('長い単位は、画面に収まるように自動で小さく表示します。')}
        </p>
        <div className="field">
          <div className="label">{t('書体')}</div>
          <div className="segmented" role="group">
            <button aria-pressed={s.font === 'mincho'} onClick={() => update({ font: 'mincho' })}>
              {t('明朝')}
            </button>
            <button aria-pressed={s.font === 'gothic'} onClick={() => update({ font: 'gothic' })}>
              {t('ゴシック')}
            </button>
          </div>
        </div>
        <div className="field">
          <div className="label">{t('文字の向き')}</div>
          <div className="segmented" role="group">
            <button aria-pressed={s.direction === 'horizontal'} onClick={() => update({ direction: 'horizontal' })}>
              {t('横書き')}
            </button>
            <button aria-pressed={s.direction === 'vertical'} onClick={() => update({ direction: 'vertical' })}>
              {t('縦書き')}
            </button>
          </div>
        </div>
        <div className="field">
          <div className="label">{t('視線のガイド')}</div>
          <div className="segmented" role="group">
            <button aria-pressed={s.guide === 'none'} onClick={() => update({ guide: 'none' })}>
              {t('なし')}
            </button>
            <button aria-pressed={s.guide === 'center'} onClick={() => update({ guide: 'center' })}>
              {t('中央の目印')}
            </button>
            <button aria-pressed={s.guide === 'focus'} onClick={() => update({ guide: 'focus' })}>
              {t('注視点を強調')}
            </button>
          </div>
          <p className="small muted">{t('「注視点を強調」は、単位の前から約3分の1の文字に色を付け、その文字を画面中央に置きます。はみ出す場合は中央寄せを優先します。')}</p>
        </div>
        <div className="field">
          <div className="label">{t('挿絵の位置に来たら')}</div>
          <div className="segmented" role="group">
            {(
              [
                ['pause', t('止まる')],
                ['show', t('{n}秒表示', { n: s.illustSeconds })],
                ['skip', t('飛ばす')],
              ] as const
            ).map(([v, l]) => (
              <button key={v} aria-pressed={s.illustMode === v} onClick={() => update({ illustMode: v })}>
                {l}
              </button>
            ))}
          </div>
          {s.illustMode === 'show' && (
            <input type="range" min={1} max={15} value={s.illustSeconds} onChange={(e) => update({ illustSeconds: Number(e.target.value) })} aria-label={t('挿絵を表示する秒数')} />
          )}
          <p className="small muted">{t('挿絵を表示している時間は、読書速度の計算に含めません。')}</p>
        </div>
        <label className="switch">
          <span>{t('論文の参考文献を飛ばす')}</span>
          <input type="checkbox" checked={s.skipReferences} onChange={(e) => update({ skipReferences: e.target.checked })} />
        </label>
        <p className="small muted" style={{ margin: 0 }}>
          {t('「References」「参考文献」などの見出しから、付録（Appendix）の見出しの手前までを高速読書で飛ばします。PDF表示と全文パネルでは読めます。')}
        </p>
        <label className="switch">
          <span>{t('登録した人物名を色分け')}</span>
          <input type="checkbox" checked={s.personColors} onChange={(e) => update({ personColors: e.target.checked })} />
        </label>
        <label className="switch">
          <span>{t('人物名を含む単位を少し長く表示')}</span>
          <input type="checkbox" checked={s.nameBoost} onChange={(e) => update({ nameBoost: e.target.checked })} />
        </label>
        <label className="switch">
          <span>{t('一時停止中に全文パネルを表示')}</span>
          <input type="checkbox" checked={s.showContext} onChange={(e) => update({ showContext: e.target.checked })} />
        </label>
        <label className="switch">
          <span>{t('再生中も進捗と残り時間を表示')}</span>
          <input type="checkbox" checked={s.showProgressWhilePlaying} onChange={(e) => update({ showProgressWhilePlaying: e.target.checked })} />
        </label>
      </div>

      <div className="section-title">{t('キーボード操作')}</div>
      <div className="card small">
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            {[
              ['Space / Enter', t('再生・一時停止')],
              ['← / →', t('1単位戻る・進む')],
              [t('↑ / ↓（Shift+←→）'), t('前・次の段落')],
              ['+ / −', t('速度を50字/分ずつ変える')],
              ['[ / ]', t('文字サイズ')],
              ['T', t('配色を切り替え')],
              ['P', t('元のPDFを見る')],
              ['Home', t('最初から読む')],
              ['Esc', t('一時停止・本棚へ戻る')],
            ].map(([k, v]) => (
              <tr key={k}>
                <td style={{ padding: '4px 0', whiteSpace: 'nowrap', fontWeight: 600 }}>{k}</td>
                <td className="muted">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="section-title">{t('保存データ')}</div>
      <div className="card stack small">
        {storage ? (
          <div>
            {t('使用量 {size}', { size: formatBytes(storage.usage) })}
            {storage.quota > 0 && t(' / 上限の目安 {size}', { size: formatBytes(storage.quota) })}
            <br />
            {storage.persisted ? t('自動削除されない設定になっています。') : t('ブラウザの判断で、長く使っていないデータが消される可能性があります。')}
          </div>
        ) : (
          <div className="muted">{t('容量を取得できませんでした。')}</div>
        )}
        {storage && !storage.persisted && (
          <button
            className="btn small"
            onClick={async () => {
              const ok = await requestPersist()
              toast(ok ? t('保存データを保護しました') : t('ブラウザに許可されませんでした。ホーム画面に追加すると保護されやすくなります。'))
              setStorage(await storageInfo())
            }}
          >
            {t('保存データを保護するよう依頼する')}
          </button>
        )}
        <p className="muted" style={{ margin: 0 }}>
          {t('iPhoneのSafariでは、ホーム画面に追加していないサイトのデータは、7日間使わないと削除されることがあります。長編を読むときは「共有 → ホーム画面に追加」で起動してください。')}
        </p>
        <button className="btn small" onClick={() => update({ ...DEFAULT_SETTINGS })}>
          {t('読書設定を初期値に戻す')}
        </button>
      </div>
    </div>
  )
}
