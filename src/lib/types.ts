export type Source = 'gemini' | 'chatgpt' | 'claude' | 'other'

export interface Msg {
  role: 'user' | 'ai' | 'raw'
  text: string
}

export interface Chat {
  id: string
  source: Source
  title: string
  date: number // ミリ秒
  messages: Msg[]
  summarized: boolean
  sample?: boolean
}

export interface Note {
  id: string
  kind: 'memory' | 'rule' // 記憶（出来事・決めたこと）／教本（好み・ルール・前提）
  text: string
  pinned: boolean // true なら、引き継ぎ文に必ず入れる
  chatId?: string
  createdAt: number
  sample?: boolean
}

export type Provider = 'gemini' | 'openai' | 'anthropic'

export interface Settings {
  provider: Provider
  apiKey: string
  model: string
  gapMinutes: number // Gemini の時系列ログを会話に分ける間隔（分）
}

export const SOURCE_LABEL: Record<Source, string> = {
  gemini: 'Gemini',
  chatgpt: 'ChatGPT',
  claude: 'Claude',
  other: 'その他',
}

export const DEFAULT_SETTINGS: Settings = {
  provider: 'gemini',
  apiKey: '',
  model: 'gemini-2.5-flash',
  gapMinutes: 30,
}

export const PROVIDER_DEFAULT_MODEL: Record<Provider, string> = {
  gemini: 'gemini-2.5-flash',
  openai: 'gpt-4o-mini',
  anthropic: 'claude-haiku-5-5',
}

export const PROVIDER_LABEL: Record<Provider, string> = {
  gemini: 'Gemini（Google）',
  openai: 'OpenAI（ChatGPT の API）',
  anthropic: 'Anthropic（Claude の API）',
}

export const PROVIDER_HOST: Record<Provider, string> = {
  gemini: 'generativelanguage.googleapis.com（Google）',
  openai: 'api.openai.com（OpenAI）',
  anthropic: 'api.anthropic.com（Anthropic）',
}

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
}

export function fmtDate(ms: number): string {
  if (!ms) return '日付なし'
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
