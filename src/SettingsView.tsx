import { useState } from 'react'
import { PROVIDER_DEFAULT_MODEL, PROVIDER_HOST, PROVIDER_LABEL, uid, type Chat, type Note, type Provider } from './lib/types'
import { ConfirmButton, type Store } from './ui'

const BACKUP_APP = 'ai-chat-memory-note'

interface Backup {
  app: string
  version: number
  exportedAt: string
  chats: Chat[]
  notes: Note[]
}

function parseBackup(text: string): Backup {
  let raw: Partial<Backup>
  try {
    raw = JSON.parse(text) as Partial<Backup>
  } catch {
    throw new Error('ファイルを JSON として読めませんでした。')
  }
  if (!raw || raw.app !== BACKUP_APP || !Array.isArray(raw.chats) || !Array.isArray(raw.notes)) {
    throw new Error('このアプリで書き出したバックアップではないようです。「バックアップを書き出す」で作った .json を選んでください。')
  }
  const chats = raw.chats.filter((c) => c && typeof c.title === 'string' && Array.isArray(c.messages)).map((c) => ({ ...c, id: c.id || uid(), summarized: !!c.summarized }))
  const notes = raw.notes.filter((n) => n && typeof n.text === 'string' && (n.kind === 'memory' || n.kind === 'rule')).map((n) => ({ ...n, id: n.id || uid(), pinned: !!n.pinned }))
  return { app: BACKUP_APP, version: 1, exportedAt: String(raw.exportedAt ?? ''), chats, notes }
}

export default function SettingsView({ store }: { store: Store }) {
  const s = store.settings
  const [showKey, setShowKey] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, setPending] = useState<Backup | null>(null)

  const exportAll = () => {
    const b: Backup = { app: BACKUP_APP, version: 1, exportedAt: new Date().toISOString(), chats: store.chats, notes: store.notes }
    const blob = new Blob([JSON.stringify(b)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    const d = new Date()
    a.download = `AIチャット記憶教本_バックアップ_${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(a.href), 2000)
    setMsg({ ok: true, text: `バックアップを書き出しました（チャット ${store.chats.length} 件・記憶と教本 ${store.notes.length} 件）。API キーは入っていません。` })
  }

  const pickBackup = async (f: File | undefined) => {
    if (!f) return
    try {
      setPending(parseBackup(await f.text()))
      setMsg(null)
    } catch (e) {
      setPending(null)
      setMsg({ ok: false, text: e instanceof Error ? e.message : '読み込めませんでした。' })
    }
  }

  return (
    <>
      <section className="card">
        <h2>自動で要約するための設定（やり方B・任意）</h2>
        <p className="hint">
          自分の API キーを入れた人だけが使えます。<b>キーは、この端末のブラウザの中にだけ保存します。</b>バックアップにも入りません。キーを入れなければ、通信は一切行いません。
        </p>
        <label className="lab" htmlFor="provider">
          どの会社の API を使うか
        </label>
        <select
          id="provider"
          className="in"
          value={s.provider}
          onChange={(e) => {
            const p = e.target.value as Provider
            const wasDefault = s.model === PROVIDER_DEFAULT_MODEL[s.provider] || !s.model
            store.changeSettings({ provider: p, model: wasDefault ? PROVIDER_DEFAULT_MODEL[p] : s.model })
          }}
        >
          {(Object.keys(PROVIDER_LABEL) as Provider[]).map((p) => (
            <option key={p} value={p}>
              {PROVIDER_LABEL[p]}
            </option>
          ))}
        </select>
        <label className="lab" htmlFor="model">
          モデル名
        </label>
        <input id="model" className="in" value={s.model} onChange={(e) => store.changeSettings({ model: e.target.value })} />
        <p className="hint">入っている名前は、こちらで決めた初期値です。<b>各社の最新のモデル一覧で確かめていません</b>（Anthropic 以外は、古い・使えない名前のこともあります）。エラーが出たら、各社の画面で確かめた名前に変えてください。</p>
        <label className="lab" htmlFor="apikey">
          API キー
        </label>
        <div className="row grow">
          <input id="apikey" className="in" type={showKey ? 'text' : 'password'} value={s.apiKey} onChange={(e) => store.changeSettings({ apiKey: e.target.value })} autoComplete="off" spellCheck={false} placeholder="（空のまま＝通信しません）" />
          <button type="button" className="btn sub" onClick={() => setShowKey(!showKey)}>
            {showKey ? '隠す' : '表示する'}
          </button>
        </div>
        <p className="hint">
          自動で要約するボタンを押したときだけ、選んだ会社（{PROVIDER_HOST[s.provider]}）へ、そのチャットの本文を送ります。<b>実際のキーでの通信は、こちらでは確かめていません</b>（確認は、通信を模した試験まで）。
        </p>
        {s.apiKey && <ConfirmButton label="保存したキーを消す" onYes={() => store.changeSettings({ apiKey: '' })} />}
      </section>

      <section className="card">
        <h2>バックアップ（全体を JSON で）</h2>
        <div className="row">
          <button type="button" className="btn main" onClick={exportAll} disabled={store.chats.length + store.notes.length === 0}>
            バックアップを書き出す
          </button>
          <label className="btn sub">
            バックアップを読み込む
            <input id="backup-input" type="file" accept=".json,application/json" hidden onChange={(e) => { void pickBackup(e.target.files?.[0]); e.target.value = '' }} />
          </label>
        </div>
        {pending && (
          <div className="pending" role="status">
            <p>
              読み込めます：チャット {pending.chats.length} 件・記憶と教本 {pending.notes.length} 件。どちらで入れますか？
            </p>
            <div className="row">
              <button type="button" className="btn main" onClick={() => { store.replaceAll(pending.chats, pending.notes, true); setMsg({ ok: true, text: '追加して読み込みました（同じ ID のものは、バックアップの内容で上書き）。' }); setPending(null) }}>
                いまのデータに追加する
              </button>
              <ConfirmButton label="いまのデータを置き換える" onYes={() => { store.replaceAll(pending.chats, pending.notes, false); setMsg({ ok: true, text: '置き換えて読み込みました。' }); setPending(null) }} />
              <button type="button" className="btn sub" onClick={() => setPending(null)}>
                やめる
              </button>
            </div>
          </div>
        )}
        {msg && (
          <p className={msg.ok ? 'info' : 'warn'} role="status">
            {msg.text}
          </p>
        )}
      </section>

      <section className="card">
        <h2>全部消す</h2>
        <p className="hint">この端末に保存した、チャット・記憶・教本を、すべて消します（API キーの設定は残ります）。先にバックアップを書き出しておくと、戻せます。</p>
        <ConfirmButton label="チャット・記憶・教本を全部消す" onYes={() => { store.clearAll(); setMsg({ ok: true, text: '全部消しました。' }) }} />
      </section>
    </>
  )
}
