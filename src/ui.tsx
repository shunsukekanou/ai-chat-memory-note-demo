import { useEffect, useState } from 'react'
import type { Chat, Note, Settings } from './lib/types'
import type { ParsedChat } from './lib/parse'

export interface Store {
  chats: Chat[]
  notes: Note[]
  settings: Settings
  addChats: (list: ParsedChat[]) => { added: number; skipped: number }
  updateChat: (id: string, patch: Partial<Chat>) => void
  removeChat: (id: string) => void
  addNotes: (list: { kind: Note['kind']; text: string; chatId?: string; pinned?: boolean }[]) => void
  updateNote: (id: string, patch: Partial<Note>) => void
  removeNote: (id: string) => void
  changeSettings: (patch: Partial<Settings>) => void
  loadSample: () => void
  removeSamples: () => void
  replaceAll: (chats: Chat[], notes: Note[], merge: boolean) => void
  clearAll: () => void
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // 古い環境では、選択して Ctrl+C を案内する
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  } catch {
    return false
  }
}

/** 押すと「もう一度押すと実行します」に変わるボタン（うっかり消すのを防ぐ） */
export function ConfirmButton({ label, onYes, className }: { label: string; onYes: () => void; className?: string }) {
  const [ask, setAsk] = useState(false)
  useEffect(() => {
    if (!ask) return
    const t = setTimeout(() => setAsk(false), 4000)
    return () => clearTimeout(t)
  }, [ask])
  return (
    <button
      type="button"
      className={(className ?? 'btn sub') + (ask ? ' danger' : '')}
      onClick={() => {
        if (ask) {
          setAsk(false)
          onYes()
        } else setAsk(true)
      }}
    >
      {ask ? 'もう一度押すと実行します' : label}
    </button>
  )
}

/** 押すとコピーするボタン。押したあと、しばらく「コピーしました」と出す */
export function CopyButton({ text, label, className }: { text: string; label: string; className?: string }) {
  const [state, setState] = useState<'idle' | 'ok' | 'ng'>('idle')
  useEffect(() => {
    if (state === 'idle') return
    const t = setTimeout(() => setState('idle'), 2500)
    return () => clearTimeout(t)
  }, [state])
  return (
    <button
      type="button"
      className={className ?? 'btn main'}
      onClick={async () => setState((await copyText(text)) ? 'ok' : 'ng')}
    >
      {state === 'ok' ? 'コピーしました' : state === 'ng' ? 'コピーできませんでした（枠の中を選んで Ctrl+C）' : label}
    </button>
  )
}
