// 書き出しファイルの読み取り。どれも端末の中だけで処理する（通信なし）。
import type { Msg, Source } from './types'

export interface ParsedChat {
  source: Source
  title: string
  date: number
  messages: Msg[]
}

export interface ParseResult {
  kind: string // 画面に出す、判定した形式の名前
  chats: ParsedChat[]
  notes: string[] // 読み取れなかった部分などの案内
}

const strip = (s: string) =>
  s
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

const short = (s: string, n = 28) => {
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length > n ? t.slice(0, n) + '…' : t || '（題名なし）'
}

// ---------- ChatGPT（conversations.json） ----------
interface GptNode {
  parent?: string | null
  message?: {
    author?: { role?: string }
    create_time?: number | null
    content?: { parts?: unknown[]; text?: string }
  } | null
}
interface GptConv {
  title?: string
  create_time?: number
  update_time?: number
  current_node?: string
  mapping?: Record<string, GptNode>
}

function gptMessages(c: GptConv): Msg[] {
  const map = c.mapping ?? {}
  const textOf = (n: GptNode): string => {
    const ct = n.message?.content
    if (!ct) return ''
    if (Array.isArray(ct.parts)) return ct.parts.filter((p) => typeof p === 'string').join('\n').trim()
    return typeof ct.text === 'string' ? ct.text.trim() : ''
  }
  let nodes: GptNode[] = []
  if (c.current_node && map[c.current_node]) {
    // いまの会話の筋（最後の発言から、親をたどる）
    let id: string | null | undefined = c.current_node
    const guard = new Set<string>()
    while (id && map[id] && !guard.has(id)) {
      guard.add(id)
      nodes.push(map[id])
      id = map[id].parent
    }
    nodes.reverse()
  } else {
    nodes = Object.values(map).sort((a, b) => (a.message?.create_time ?? 0) - (b.message?.create_time ?? 0))
  }
  const out: Msg[] = []
  for (const n of nodes) {
    const role = n.message?.author?.role
    if (role !== 'user' && role !== 'assistant') continue
    const t = textOf(n)
    if (t) out.push({ role: role === 'user' ? 'user' : 'ai', text: t })
  }
  return out
}

// ---------- Claude（conversations.json） ----------
interface ClaudeMsg {
  sender?: string
  text?: string
  content?: { type?: string; text?: string }[]
}
interface ClaudeConv {
  name?: string
  created_at?: string
  chat_messages?: ClaudeMsg[]
}

// ---------- Google Takeout（マイ アクティビティ） ----------
interface Entry {
  t: number
  prompt: string
  reply: string
}

const PROMPT_PREFIX = /^(Prompted|Asked|Said|Searched for)\s*[:：]?\s*|^プロンプト\s*[:：]?\s*|^質問\s*[:：]?\s*/i

function cleanPrompt(s: string): string {
  let t = s.trim().replace(PROMPT_PREFIX, '')
  const m = t.match(/^[「『"“](.*)[」』"”]\s*(?:というプロンプト.*)?$/s)
  if (m) t = m[1]
  return t.trim()
}

export function parseDateText(s: string): number {
  const m = s.match(/(\d{4})[/年.\-](\d{1,2})[/月.\-](\d{1,2})日?[\sT]*(\d{1,2})?:?(\d{2})?:?(\d{2})?/)
  if (m && s.match(/\d{4}[/年.\-]\d{1,2}[/月.\-]\d{1,2}/)) {
    return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0)).getTime()
  }
  const t = Date.parse(s.replace(/\b(JST|UTC|GMT)\b/g, '').replace(/ /g, ' '))
  return Number.isNaN(t) ? 0 : t
}

function groupEntries(entries: Entry[], gapMin: number, source: Source): ParsedChat[] {
  const sorted = [...entries].sort((a, b) => a.t - b.t)
  const groups: Entry[][] = []
  for (const e of sorted) {
    const g = groups[groups.length - 1]
    if (g && e.t && g[g.length - 1].t && e.t - g[g.length - 1].t <= gapMin * 60000) g.push(e)
    else groups.push([e])
  }
  return groups.map((g) => {
    const messages: Msg[] = []
    for (const e of g) {
      messages.push({ role: 'user', text: e.prompt })
      if (e.reply) messages.push({ role: 'ai', text: e.reply })
    }
    return { source, title: short(g[0].prompt), date: g[0].t, messages }
  })
}

function parseTakeoutJson(arr: Record<string, unknown>[], gapMin: number): ParseResult {
  const hasGemini = arr.some((e) => String(e.header ?? '').includes('Gemini'))
  const entries: Entry[] = []
  for (const e of arr) {
    if (hasGemini && !String(e.header ?? '').includes('Gemini')) continue
    const prompt = cleanPrompt(String(e.title ?? ''))
    if (!prompt) continue
    const items = Array.isArray(e.safeHtmlItem) ? (e.safeHtmlItem as { html?: string; text?: string }[]) : []
    const reply = items.map((i) => strip(i.html ?? i.text ?? '')).filter(Boolean).join('\n')
    entries.push({ t: parseDateText(String(e.time ?? '')), prompt, reply })
  }
  const chats = groupEntries(entries, gapMin, 'gemini')
  return {
    kind: 'Google データ エクスポート（マイ アクティビティ・JSON）',
    chats,
    notes: [`${entries.length} 件のやり取りを、間隔 ${gapMin} 分で ${chats.length} 件の会話にまとめました。`],
  }
}

function parseTakeoutHtml(html: string, gapMin: number): ParseResult {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const cells = Array.from(doc.querySelectorAll('.content-cell.mdl-typography--body-1'))
  const entries: Entry[] = []
  for (const c of cells) {
    const lines = c.innerHTML
      .split(/<br\s*\/?>/i)
      .map((l) => strip(l))
      .filter((l) => l)
    if (!lines.length) continue
    const prompt = cleanPrompt(lines[0])
    if (!prompt) continue
    let di = lines.findIndex((l, i) => i > 0 && parseDateText(l) > 0 && /\d{4}|[A-Z][a-z]{2} \d/.test(l) && l.length < 60)
    if (di < 0) di = 0
    const t = di > 0 ? parseDateText(lines[di]) : 0
    const reply = lines.slice(di + 1).join('\n').trim()
    entries.push({ t, prompt, reply })
  }
  const chats = groupEntries(entries, gapMin, 'gemini')
  const noDate = entries.filter((e) => !e.t).length
  const notes = [`${entries.length} 件のやり取りを、間隔 ${gapMin} 分で ${chats.length} 件の会話にまとめました。`]
  if (noDate) notes.push(`${noDate} 件は日時を読み取れませんでした（日付なしで入っています）。`)
  return { kind: 'Google データ エクスポート（マイ アクティビティ・HTML）', chats, notes }
}

export function parseExport(text: string, filename: string, gapMin: number): ParseResult {
  const head = text.trimStart().slice(0, 1)
  if (/\.html?$/i.test(filename) || head === '<') {
    const r = parseTakeoutHtml(text, gapMin)
    if (!r.chats.length) throw new Error('HTML の中に、Gemini のやり取りが見つかりませんでした。')
    return r
  }
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('ファイルを JSON として読めませんでした。書き出したままの .json ファイルを選んでください。')
  }
  const arr: Record<string, unknown>[] = Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? [raw as Record<string, unknown>] : []
  if (!arr.length) throw new Error('ファイルの中に、チャットが入っていませんでした。')
  const first = arr[0]
  if ('mapping' in first) {
    const chats: ParsedChat[] = []
    for (const c of arr as GptConv[]) {
      const messages = gptMessages(c)
      if (!messages.length) continue
      const ts = (c.create_time ?? c.update_time ?? 0) * 1000
      chats.push({ source: 'chatgpt', title: (c.title && c.title.trim()) || short(messages[0].text), date: ts, messages })
    }
    return { kind: 'ChatGPT（conversations.json）', chats, notes: [`${chats.length} 件のチャットを読み取りました。`] }
  }
  if ('chat_messages' in first) {
    const chats: ParsedChat[] = []
    for (const c of arr as ClaudeConv[]) {
      const messages: Msg[] = []
      for (const m of c.chat_messages ?? []) {
        const t =
          (typeof m.text === 'string' && m.text.trim()) ||
          (m.content ?? [])
            .filter((b) => b.type === 'text' && b.text)
            .map((b) => b.text)
            .join('\n')
            .trim()
        if (t) messages.push({ role: m.sender === 'human' ? 'user' : 'ai', text: t })
      }
      if (!messages.length) continue
      chats.push({ source: 'claude', title: (c.name && c.name.trim()) || short(messages[0].text), date: c.created_at ? Date.parse(c.created_at) || 0 : 0, messages })
    }
    return { kind: 'Claude（conversations.json）', chats, notes: [`${chats.length} 件のチャットを読み取りました。`] }
  }
  if ('title' in first && ('time' in first || 'header' in first)) {
    const r = parseTakeoutJson(arr, gapMin)
    if (!r.chats.length) throw new Error('JSON の中に、Gemini のやり取りが見つかりませんでした。')
    return r
  }
  throw new Error('この形のファイルは読めませんでした。対応：Google の MyActivity（JSON／HTML）、ChatGPT と Claude の conversations.json。それ以外は「貼り付けて取り込む」を使ってください。')
}

/** 貼り付けた1本分のチャットを、1つの本文として取り込む */
export function pastedChat(source: Source, title: string, date: number, text: string): ParsedChat {
  return { source, title: title.trim() || short(text), date, messages: [{ role: 'raw', text: text.trim() }] }
}
