// 端末の中（IndexedDB）への保存。外部への通信はしない。
import { DEFAULT_SETTINGS, type Chat, type Note, type Settings } from './types'

const DB_NAME = 'ai-chat-memory-note'
const STORES = ['chats', 'notes', 'kv'] as const
type StoreName = (typeof STORES)[number]

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      db.createObjectStore('chats', { keyPath: 'id' })
      db.createObjectStore('notes', { keyPath: 'id' })
      db.createObjectStore('kv')
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function run<T>(stores: StoreName[], mode: IDBTransactionMode, fn: (tx: IDBTransaction) => Promise<T> | T): Promise<T> {
  const db = await open()
  try {
    const tx = db.transaction(stores, mode)
    const done = new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
    const out = await fn(tx)
    await done
    return out
  } finally {
    db.close()
  }
}

const reqP = <T>(r: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    r.onsuccess = () => resolve(r.result)
    r.onerror = () => reject(r.error)
  })

export interface Loaded {
  chats: Chat[]
  notes: Note[]
  settings: Settings
}

export async function loadAll(): Promise<Loaded> {
  try {
    return await run(['chats', 'notes', 'kv'], 'readonly', async (tx) => {
      const chats = (await reqP(tx.objectStore('chats').getAll())) as Chat[]
      const notes = (await reqP(tx.objectStore('notes').getAll())) as Note[]
      const s = (await reqP(tx.objectStore('kv').get('settings'))) as Settings | undefined
      return { chats, notes, settings: { ...DEFAULT_SETTINGS, ...(s ?? {}) } }
    })
  } catch {
    return { chats: [], notes: [], settings: { ...DEFAULT_SETTINGS } }
  }
}

export async function putChats(list: Chat[]): Promise<void> {
  if (!list.length) return
  await run(['chats'], 'readwrite', (tx) => {
    const st = tx.objectStore('chats')
    for (const c of list) st.put(c)
  })
}

export async function putNotes(list: Note[]): Promise<void> {
  if (!list.length) return
  await run(['notes'], 'readwrite', (tx) => {
    const st = tx.objectStore('notes')
    for (const n of list) st.put(n)
  })
}

export async function deleteChats(ids: string[]): Promise<void> {
  if (!ids.length) return
  await run(['chats'], 'readwrite', (tx) => {
    for (const id of ids) tx.objectStore('chats').delete(id)
  })
}

export async function deleteNotes(ids: string[]): Promise<void> {
  if (!ids.length) return
  await run(['notes'], 'readwrite', (tx) => {
    for (const id of ids) tx.objectStore('notes').delete(id)
  })
}

export async function saveSettings(s: Settings): Promise<void> {
  await run(['kv'], 'readwrite', (tx) => {
    tx.objectStore('kv').put(s, 'settings')
  })
}

export async function clearAllData(): Promise<void> {
  await run(['chats', 'notes'], 'readwrite', (tx) => {
    tx.objectStore('chats').clear()
    tx.objectStore('notes').clear()
  })
}
