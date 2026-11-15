import { useCallback, useEffect, useRef, useState } from 'react'
import * as db from './lib/db'
import { sampleData } from './lib/sample'
import { uid, type Chat, type Note, type Settings, DEFAULT_SETTINGS } from './lib/types'
import type { Store } from './ui'
import ImportView from './ImportView'
import OrganizeView from './OrganizeView'
import HandoffView from './HandoffView'
import SettingsView from './SettingsView'

type Tab = 'import' | 'organize' | 'handoff' | 'settings'

const TABS: { id: Tab; label: string; sub: string }[] = [
  { id: 'import', label: '取り込む', sub: '入口' },
  { id: 'organize', label: '整理する', sub: '要約・教本' },
  { id: 'handoff', label: '引き継ぐ', sub: '出口' },
  { id: 'settings', label: '設定', sub: 'キー・保存' },
]

export default function App() {
  const [chats, setChats] = useState<Chat[]>([])
  const [notes, setNotes] = useState<Note[]>([])
  const [settings, setSettings] = useState<Settings>({ ...DEFAULT_SETTINGS })
  const [loaded, setLoaded] = useState(false)
  const [tab, setTab] = useState<Tab>('import')
  const ref = useRef({ chats, notes, settings })
  ref.current = { chats, notes, settings }

  useEffect(() => {
    db.loadAll().then((d) => {
      setChats(d.chats)
      setNotes(d.notes)
      setSettings(d.settings)
      if (d.chats.length) setTab('organize')
      setLoaded(true)
    })
  }, [])

  const apply = useCallback((nextChats: Chat[] | null, nextNotes: Note[] | null) => {
    if (nextChats) {
      ref.current = { ...ref.current, chats: nextChats }
      setChats(nextChats)
    }
    if (nextNotes) {
      ref.current = { ...ref.current, notes: nextNotes }
      setNotes(nextNotes)
    }
  }, [])

  const store: Store = {
    chats,
    notes,
    settings,
    addChats(list) {
      const cur = ref.current.chats
      const seen = new Set(cur.map((c) => `${c.source}|${c.title}|${c.date}`))
      const add: Chat[] = []
      let skipped = 0
      for (const p of list) {
        const key = `${p.source}|${p.title}|${p.date}`
        if (seen.has(key)) {
          skipped++
          continue
        }
        seen.add(key)
        add.push({ id: uid(), source: p.source, title: p.title, date: p.date, messages: p.messages, summarized: false })
      }
      if (add.length) {
        apply([...cur, ...add], null)
        void db.putChats(add)
      }
      return { added: add.length, skipped }
    },
    updateChat(id, patch) {
      const next = ref.current.chats.map((c) => (c.id === id ? { ...c, ...patch } : c))
      apply(next, null)
      const one = next.find((c) => c.id === id)
      if (one) void db.putChats([one])
    },
    removeChat(id) {
      apply(
        ref.current.chats.filter((c) => c.id !== id),
        null,
      )
      void db.deleteChats([id])
    },
    addNotes(list) {
      const add: Note[] = list
        .filter((x) => x.text.trim())
        .map((x) => ({ id: uid(), kind: x.kind, text: x.text.trim(), pinned: x.pinned ?? false, chatId: x.chatId, createdAt: Date.now() }))
      if (!add.length) return
      apply(null, [...ref.current.notes, ...add])
      void db.putNotes(add)
    },
    updateNote(id, patch) {
      const next = ref.current.notes.map((n) => (n.id === id ? { ...n, ...patch } : n))
      apply(null, next)
      const one = next.find((n) => n.id === id)
      if (one) void db.putNotes([one])
    },
    removeNote(id) {
      apply(
        null,
        ref.current.notes.filter((n) => n.id !== id),
      )
      void db.deleteNotes([id])
    },
    changeSettings(patch) {
      const next = { ...ref.current.settings, ...patch }
      ref.current = { ...ref.current, settings: next }
      setSettings(next)
      void db.saveSettings(next)
    },
    loadSample() {
      const cur = ref.current
      if (cur.chats.some((c) => c.sample)) return
      const s = sampleData()
      apply([...cur.chats, ...s.chats], [...cur.notes, ...s.notes])
      void db.putChats(s.chats)
      void db.putNotes(s.notes)
    },
    removeSamples() {
      const cur = ref.current
      const cids = cur.chats.filter((c) => c.sample).map((c) => c.id)
      const nids = cur.notes.filter((n) => n.sample).map((n) => n.id)
      apply(
        cur.chats.filter((c) => !c.sample),
        cur.notes.filter((n) => !n.sample),
      )
      void db.deleteChats(cids)
      void db.deleteNotes(nids)
    },
    replaceAll(newChats, newNotes, merge) {
      const cur = ref.current
      if (!merge) {
        void db.deleteChats(cur.chats.map((c) => c.id))
        void db.deleteNotes(cur.notes.map((n) => n.id))
      }
      const mergeBy = <T extends { id: string }>(a: T[], b: T[]) => {
        const m = new Map(a.map((x) => [x.id, x]))
        for (const x of b) m.set(x.id, x)
        return [...m.values()]
      }
      const c2 = merge ? mergeBy(cur.chats, newChats) : newChats
      const n2 = merge ? mergeBy(cur.notes, newNotes) : newNotes
      apply(c2, n2)
      void db.putChats(newChats)
      void db.putNotes(newNotes)
    },
    clearAll() {
      apply([], [])
      void db.clearAllData()
    },
  }

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <span className="logo" aria-hidden="true">
            ✎
          </span>
          <div>
            <h1>AIチャット記憶・教本ノート</h1>
            <p>過去のチャットを、記憶と教本に育てて、どのAIにも持ち込む。</p>
          </div>
        </div>
        <nav className="tabs" aria-label="画面の切り替え">
          {TABS.map((t) => (
            <button key={t.id} type="button" className={'tab' + (tab === t.id ? ' on' : '')} onClick={() => setTab(t.id)} aria-current={tab === t.id ? 'page' : undefined}>
              <span>{t.label}</span>
              <small>{t.sub}</small>
            </button>
          ))}
        </nav>
      </header>
      <main>
        <p className="net" role="note">
          <b>通信：</b>
          ふだんは、外へ何も送りません。設定に自分の API キーを入れて「自動で要約する」を押したときだけ、そのチャットの本文を、選んだ会社へ送ります。
        </p>
        {!loaded ? (
          <p className="hint">読み込み中…</p>
        ) : (
          <>
            {tab === 'import' && <ImportView store={store} goOrganize={() => setTab('organize')} />}
            {tab === 'organize' && <OrganizeView store={store} goImport={() => setTab('import')} goSettings={() => setTab('settings')} />}
            {tab === 'handoff' && <HandoffView store={store} goOrganize={() => setTab('organize')} />}
            {tab === 'settings' && <SettingsView store={store} />}
          </>
        )}
      </main>
    </div>
  )
}
