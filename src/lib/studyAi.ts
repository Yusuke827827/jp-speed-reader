// 英語学習モードの AI 呼び出し（Anthropic の Messages API）。
//
// 今は「自分の API キーを入れて試す」形。キーはこのブラウザの localStorage にだけ置き、
// バックアップの書き出しには入れない（IndexedDB の kv ではなく localStorage にしている理由）。
// 販売するときは、Mindrawer と同じく購入を確かめる中継サーバーを間に置き、キーを端末に持たせない。

import Anthropic from '@anthropic-ai/sdk'
import { getKV, setKV } from './db'
import {
  ANALYSIS_SCHEMA,
  DEFAULT_MODEL,
  MAX_INPUT,
  MODELS,
  WORD_SCHEMA,
  WORD_SYSTEM,
  analysisCacheKey,
  analysisRequestText,
  costUsd,
  parseAnalysis,
  parseWord,
  systemPrompt,
  wordCacheKey,
  wordRequestText,
  type Analysis,
  type Direction,
  type StudyModel,
  type WordEntry,
} from './study'
import { newMaterial, putMaterial, splitForAnalysis, type Material } from './studyTools'

const KEY_STORE = 'flowa.study.apiKey'
const MODEL_STORE = 'flowa.study.model'
const SPEND_STORE = 'flowa.study.spend'

function ls(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

export function getApiKey(): string {
  return ls()?.getItem(KEY_STORE) ?? ''
}

export function setApiKey(key: string) {
  const s = ls()
  if (!s) return
  if (key.trim()) s.setItem(KEY_STORE, key.trim())
  else s.removeItem(KEY_STORE)
}

export function getModel(): StudyModel {
  const m = ls()?.getItem(MODEL_STORE)
  return m && m in MODELS ? (m as StudyModel) : DEFAULT_MODEL
}

export function setModel(m: StudyModel) {
  ls()?.setItem(MODEL_STORE, m)
}

/** この端末で使った AI の料金の合計（ドル、目安） */
export function getSpend(): number {
  return Number(ls()?.getItem(SPEND_STORE)) || 0
}

function addSpend(usd: number) {
  ls()?.setItem(SPEND_STORE, String(getSpend() + usd))
}

/** 画面に出す失敗の種類 */
export type StudyErrorKind = 'no-key' | 'auth' | 'rate' | 'network' | 'refusal' | 'too-long' | 'bad-json' | 'other'

export class StudyError extends Error {
  kind: StudyErrorKind
  constructor(kind: StudyErrorKind, message: string = kind) {
    super(message)
    this.kind = kind
  }
}

/** 送り先。テストでは偽物に差し替える */
export interface Transport {
  send(req: { model: StudyModel; system: string; text: string; schema: Record<string, unknown>; maxTokens: number }): Promise<{
    text: string
    stopReason: string | null
    inputTokens: number
    outputTokens: number
  }>
}

/** 本物の送り先（ブラウザから Anthropic に直接送る） */
export function anthropicTransport(apiKey: string): Transport {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 2 })
  return {
    async send({ model, system, text, schema, maxTokens }) {
      // Opus 5.5 は、安全のための判定で断られたときに別のモデルで続ける設定を付ける
      const useFallback = model === 'claude-opus-5-5'
      const res = await client.beta.messages.create({
        model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content: text }],
        output_config: { effort: 'low', format: { type: 'json_schema', schema } },
        ...(useFallback ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const } : {}),
      })
      let out = ''
      for (const b of res.content) if (b.type === 'text') out += b.text
      return { text: out, stopReason: res.stop_reason, inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens }
    },
  }
}

function toStudyError(e: unknown): StudyError {
  if (e instanceof StudyError) return e
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return new StudyError('auth')
  if (e instanceof Anthropic.RateLimitError) return new StudyError('rate')
  if (e instanceof Anthropic.APIConnectionError) return new StudyError('network')
  if (e instanceof Error && e.message === 'bad-json') return new StudyError('bad-json')
  return new StudyError('other', e instanceof Error ? e.message : String(e))
}

async function call(t: Transport, model: StudyModel, system: string, text: string, schema: Record<string, unknown>, maxTokens: number) {
  let res
  try {
    res = await t.send({ model, system, text, schema, maxTokens })
  } catch (e) {
    throw toStudyError(e)
  }
  addSpend(costUsd(model, res.inputTokens, res.outputTokens))
  if (res.stopReason === 'refusal') throw new StudyError('refusal')
  if (res.stopReason === 'max_tokens') throw new StudyError('too-long')
  return res.text
}

function transportOrThrow(t?: Transport): Transport {
  if (t) return t
  const key = getApiKey()
  if (!key) throw new StudyError('no-key')
  return anthropicTransport(key)
}

/** 文を解析する。同じ文・同じモデルなら保存してある結果を返し、AI には送らない */
export async function analyze(direction: Direction, text: string, transport?: Transport): Promise<Analysis> {
  const source = analysisRequestText(text)
  if (!source) throw new StudyError('other', 'empty')
  if (source.length > MAX_INPUT) throw new StudyError('too-long')
  const model = getModel()
  const key = analysisCacheKey(direction, source, model)
  const cached = await getKV<Analysis>(key).catch(() => undefined)
  if (cached) return cached
  const json = await call(transportOrThrow(transport), model, systemPrompt(direction), source, ANALYSIS_SCHEMA as unknown as Record<string, unknown>, 16000)
  let a: Analysis
  try {
    a = parseAnalysis(json, direction, source, model)
  } catch (e) {
    throw toStudyError(e)
  }
  await setKV(key, a).catch(() => undefined)
  return a
}

/** 単語を調べる（文の中での意味・ほかの訳・類義語・例文） */
export async function lookupWord(word: string, sentence: string, transport?: Transport): Promise<WordEntry> {
  const model = getModel()
  const key = wordCacheKey(word, sentence, model)
  const cached = await getKV<WordEntry>(key).catch(() => undefined)
  if (cached) return cached
  const json = await call(transportOrThrow(transport), model, WORD_SYSTEM, wordRequestText(word, sentence), WORD_SCHEMA as unknown as Record<string, unknown>, 8000)
  let w: WordEntry
  try {
    w = parseWord(json)
  } catch (e) {
    throw toStudyError(e)
  }
  await setKV(key, w).catch(() => undefined)
  return w
}

// ---- 教材の本棚 ----

const MATERIALS_KEY = 'study:materials'

export async function loadMaterials(): Promise<Material[]> {
  return (await getKV<Material[]>(MATERIALS_KEY).catch(() => undefined)) ?? []
}

export async function saveMaterials(list: Material[]) {
  await setKV(MATERIALS_KEY, list)
}

/** 教材の解析結果を順に読み出す（保存の場所が消えていたものは飛ばす） */
export async function loadAnalyses(m: Material): Promise<Analysis[]> {
  const out: Analysis[] = []
  for (const k of m.keys) {
    const a = await getKV<Analysis>(k).catch(() => undefined)
    if (a) out.push(a)
  }
  return out
}

/** 文章を解析して、教材として本棚に入れる。長い文章は分けて順に送る */
export async function createMaterial(
  direction: Direction,
  text: string,
  opts: { folder?: string; transport?: Transport; onProgress?: (done: number, total: number) => void; now?: number } = {},
): Promise<Material> {
  const pieces = splitForAnalysis(text)
  if (!pieces.length) throw new StudyError('other', 'empty')
  const analyses: Analysis[] = []
  const keys: string[] = []
  for (let i = 0; i < pieces.length; i++) {
    opts.onProgress?.(i, pieces.length)
    const a = await analyze(direction, pieces[i], opts.transport)
    analyses.push(a)
    keys.push(analysisCacheKey(direction, pieces[i], a.model))
  }
  opts.onProgress?.(pieces.length, pieces.length)
  const now = opts.now ?? Date.now()
  const m = newMaterial(`m${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`, keys, analyses, opts.folder ?? '', now)
  await saveMaterials(putMaterial(await loadMaterials(), m))
  return m
}

/** ファイルから文章を取り出す（テキスト・PDF は文字をそのまま、画像は端末の中で文字を読む） */
export async function readFileText(file: File, lang: 'eng' | 'jpn', onProgress?: (p: number) => void): Promise<string> {
  if (file.type.startsWith('image/')) return readImageText(file, lang, onProgress)
  const buf = await file.arrayBuffer()
  if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
    const { openPdf, closePdf } = await import('./pdf')
    const doc = await openPdf(buf)
    try {
      const pages: string[] = []
      for (let i = 1; i <= doc.numPages; i++) {
        const c = await (await doc.getPage(i)).getTextContent()
        pages.push(c.items.map((it) => ('str' in it ? it.str + (it.hasEOL ? '\n' : '') : '')).join(''))
        onProgress?.(i / doc.numPages)
      }
      return pages.join('\n').replace(/-\n(?=[a-z])/g, '').replace(/[ \t]*\n[ \t]*(?=[a-z])/g, ' ').trim()
    } finally {
      await closePdf(doc)
    }
  }
  const { decodeText } = await import('./textImport')
  return decodeText(buf).trim()
}

// ---- 写真・スクショの文字を読む（端末の中で。画像は外に送らない） ----

export async function readImageText(file: Blob, lang: 'eng' | 'jpn', onProgress?: (p: number) => void): Promise<string> {
  const { createOcrWorker } = await import('./ocr')
  const worker = await createOcrWorker(lang, (p, status) => {
    if (status.startsWith('recognizing')) onProgress?.(p)
  })
  try {
    const { data } = await worker.recognize(file)
    const text = data.text
    // 英語は行末のハイフンでの分割をつなぎ、行をつないで段落ごとにする。日本語は文字間の空白を消す
    return lang === 'eng'
      ? text
          .replace(/-\n(?=[a-z])/g, '')
          .split(/\n{2,}/)
          .map((p) => p.replace(/\s*\n\s*/g, ' ').trim())
          .filter(Boolean)
          .join('\n')
      : text.replace(/(?<=\P{ASCII})[ \t]+(?=\P{ASCII})/gu, '').trim()
  } finally {
    await worker.terminate()
  }
}
