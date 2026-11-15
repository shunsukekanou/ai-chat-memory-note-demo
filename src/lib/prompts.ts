// 要約のお願い文、返事の読み取り、引き継ぎ文の組み立て。通信はしない。
import { fmtDate, SOURCE_LABEL, type Chat, type Note } from './types'

export const PART_LIMIT = 12000

function serialize(chat: Chat): string[] {
  return chat.messages.map((m) => (m.role === 'user' ? `【私】${m.text}` : m.role === 'ai' ? `【AI】${m.text}` : m.text))
}

/** 長い履歴を、メッセージの切れ目で、PART_LIMIT 字ごとに分ける */
export function splitParts(chat: Chat, limit = PART_LIMIT): string[] {
  const parts: string[] = []
  let cur = ''
  for (let piece of serialize(chat)) {
    while (piece.length > limit) {
      if (cur) {
        parts.push(cur)
        cur = ''
      }
      parts.push(piece.slice(0, limit))
      piece = piece.slice(limit)
    }
    if (cur && cur.length + piece.length + 1 > limit) {
      parts.push(cur)
      cur = ''
    }
    cur += (cur ? '\n' : '') + piece
  }
  if (cur) parts.push(cur)
  return parts.length ? parts : ['']
}

export function buildSummaryPrompt(chat: Chat, partText: string, part: number, parts: number): string {
  const where = parts > 1 ? `（長いため ${parts} 分割した、${part} 番目です）` : ''
  return `次は、私が ${SOURCE_LABEL[chat.source]} と交わしたチャットの履歴です${where}。
題名：${chat.title}
日付：${fmtDate(chat.date)}

この履歴から、次の2つを取り出してください。
・【記憶】…出来事・決めたこと・事実（日付や固有名詞は、そのまま残す）
・【教本】…私の好み・ルール・前提（今後の相談でも、守ってほしいこと）

返事は、前置きもあとがきも書かず、必ず次の書式だけで返してください。1項目は1行にします。
該当するものが無いときは「- なし」と書いてください。

【記憶】
- （1つ目）
- （2つ目）
【教本】
- （1つ目）
- （2つ目）

--- 履歴ここから ---
${partText}
--- 履歴ここまで ---`
}

export interface Summary {
  memories: string[]
  rules: string[]
}

const NONE = /^(なし|無し|特になし|該当なし|none|n\/a|-)$/i

/** AI の返事から、【記憶】と【教本】の項目を取り出す */
export function parseSummary(text: string): Summary {
  const memories: string[] = []
  const rules: string[] = []
  let cur: string[] | null = null
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    const head = line.match(/^[\s#*>【\[「『（(]*?(記憶|教本)[】\]」』）)*:：\s]*(.*)$/)
    if (head && !/^[-・*•●]/.test(line)) {
      cur = head[1] === '記憶' ? memories : rules
      const rest = head[2].trim()
      if (rest) pushItem(cur, rest)
      continue
    }
    if (/^-{3,}$/.test(line)) {
      cur = null
      continue
    }
    if (cur) pushItem(cur, line)
  }
  return { memories, rules }
}

function pushItem(list: string[], line: string) {
  const t = line.replace(/^\s*(?:[-・*•●◯○]|\d+[.)．）])\s*/, '').replace(/\*\*/g, '').trim()
  if (!t || NONE.test(t)) return
  list.push(t)
}

// ---------- 引き継ぎ文 ----------
const norm = (s: string) => s.normalize('NFKC').toLowerCase()

function tokens(s: string): Set<string> {
  const t = norm(s)
  const out = new Set<string>()
  for (const w of t.match(/[a-z0-9]{2,}/g) ?? []) out.add(w)
  const cjk = t.replace(/[a-z0-9\s\p{P}\p{S}]/gu, '')
  for (let i = 0; i < cjk.length - 1; i++) out.add(cjk.slice(i, i + 2))
  return out
}

/** 相談したいことと、各記憶の関連度（重なった言葉の数）で選ぶ */
export function pickRelevant(topic: string, memories: Note[], chats: Chat[], max: number): Note[] {
  const q = tokens(topic)
  if (!q.size) return []
  const dateOf = (n: Note) => chats.find((c) => c.id === n.chatId)?.date ?? n.createdAt
  const scored = memories
    .map((n) => {
      const nt = norm(n.text + ' ' + (chats.find((c) => c.id === n.chatId)?.title ?? ''))
      let hit = 0
      for (const w of q) if (nt.includes(w)) hit++
      return { n, hit, d: dateOf(n) }
    })
    .filter((x) => x.hit > 0)
    .sort((a, b) => b.hit - a.hit || b.d - a.d)
  return scored.slice(0, max).map((x) => x.n)
}

export function buildHandoff(topic: string, rules: Note[], memories: Note[], chats: Chat[]): string {
  const lines: string[] = []
  lines.push('【引き継ぎメモ】')
  lines.push('これから相談を始めます。以下は、私についての前提と、過去の相談の記録です。先に読んでから、いちばん下の「今日相談したいこと」に答えてください。')
  lines.push('')
  lines.push('■ 私の好み・ルール・前提（守ってください）')
  if (rules.length) for (const r of rules) lines.push(`- ${r.text}`)
  else lines.push('- （まだ登録がありません）')
  lines.push('')
  lines.push('■ 関連する過去の記憶（出来事・決めたこと）')
  if (memories.length) {
    for (const m of memories) {
      const c = chats.find((x) => x.id === m.chatId)
      lines.push(`- ${c ? `（${fmtDate(c.date)}・${c.title}）` : ''}${m.text}`)
    }
  } else lines.push('- （関連する記憶は見つかりませんでした）')
  lines.push('')
  lines.push('■ 今日相談したいこと')
  lines.push(topic.trim() || '（ここに相談したいことを書いてください）')
  lines.push('')
  lines.push('■ お願い')
  lines.push('- 上の前提と食い違う提案をするときは、理由を添えてください。')
  lines.push('- 足りない情報があれば、最初に質問してください。')
  return lines.join('\n')
}
