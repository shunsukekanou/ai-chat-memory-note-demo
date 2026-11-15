// 自動要約（やり方B）。通信するのは、この関数が呼ばれたときだけ。
// 呼ばれるのは、設定に自分の API キーを入れ、「自動で要約する」を押したときだけ。
import { PROVIDER_HOST, type Settings } from './types'

interface GeminiRes {
  candidates?: { content?: { parts?: { text?: string }[] } }[]
  error?: { message?: string }
}
interface OpenAiRes {
  choices?: { message?: { content?: string } }[]
  error?: { message?: string }
}
interface AnthropicRes {
  content?: { type?: string; text?: string }[]
  error?: { message?: string }
}

export async function summarizeWithApi(s: Settings, prompt: string): Promise<string> {
  if (!s.apiKey.trim()) throw new Error('API キーが入っていません。「設定」で入れてください。')
  if (!s.model.trim()) throw new Error('モデル名が入っていません。「設定」で入れてください。')
  let url = ''
  let init: RequestInit
  if (s.provider === 'gemini') {
    url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(s.model.trim())}:generateContent`
    init = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': s.apiKey.trim() },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    }
  } else if (s.provider === 'openai') {
    url = 'https://api.openai.com/v1/chat/completions'
    init = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.apiKey.trim()}` },
      body: JSON.stringify({ model: s.model.trim(), messages: [{ role: 'user', content: prompt }] }),
    }
  } else {
    url = 'https://api.anthropic.com/v1/messages'
    init = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': s.apiKey.trim(),
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({ model: s.model.trim(), max_tokens: 2000, messages: [{ role: 'user', content: prompt }] }),
    }
  }
  let res: Response
  try {
    res = await fetch(url, init)
  } catch {
    throw new Error(`${PROVIDER_HOST[s.provider]} につなげませんでした。ネットワークを確かめてください。`)
  }
  let data: unknown = null
  try {
    data = await res.json()
  } catch {
    // 本文が JSON でないとき
  }
  if (!res.ok) {
    const msg = (data as { error?: { message?: string } } | null)?.error?.message ?? ''
    throw new Error(`要約に失敗しました（${res.status}）。${msg ? msg.slice(0, 160) : 'キー・モデル名・利用枠を確かめてください。'}`)
  }
  let text = ''
  if (s.provider === 'gemini') text = ((data as GeminiRes)?.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('')
  else if (s.provider === 'openai') text = (data as OpenAiRes)?.choices?.[0]?.message?.content ?? ''
  else text = ((data as AnthropicRes)?.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('')
  if (!text.trim()) throw new Error('返事が空でした。モデル名や利用枠を確かめてください。')
  return text
}
