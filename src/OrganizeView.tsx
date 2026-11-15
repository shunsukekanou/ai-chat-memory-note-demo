import { useMemo, useState } from 'react'
import { summarizeWithApi } from './lib/api'
import { buildSummaryPrompt, parseSummary, splitParts } from './lib/prompts'
import { fmtDate, PROVIDER_HOST, SOURCE_LABEL, type Chat, type Note } from './lib/types'
import { ConfirmButton, CopyButton, type Store } from './ui'

type Filter = 'all' | 'todo' | 'done'
type Sub = 'chats' | 'notes'

export default function OrganizeView({ store, goImport, goSettings }: { store: Store; goImport: () => void; goSettings: () => void }) {
  const [sub, setSub] = useState<Sub>('chats')
  return (
    <>
      <div className="subtabs" role="tablist">
        <button type="button" role="tab" aria-selected={sub === 'chats'} className={'sub' + (sub === 'chats' ? ' on' : '')} onClick={() => setSub('chats')}>
          チャット（{store.chats.length}）
        </button>
        <button type="button" role="tab" aria-selected={sub === 'notes'} className={'sub' + (sub === 'notes' ? ' on' : '')} onClick={() => setSub('notes')}>
          記憶と教本（{store.notes.length}）
        </button>
      </div>
      {sub === 'chats' ? <ChatsPane store={store} goImport={goImport} goSettings={goSettings} /> : <NotesPane store={store} />}
    </>
  )
}

// ---------------- チャットの一覧と要約 ----------------
function ChatsPane({ store, goImport, goSettings }: { store: Store; goImport: () => void; goSettings: () => void }) {
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [openId, setOpenId] = useState('')
  const [bulk, setBulk] = useState<{ running: boolean; log: string[] }>({ running: false, log: [] })

  const list = useMemo(() => {
    const kw = q.trim().toLowerCase()
    return [...store.chats]
      .filter((c) => (filter === 'all' ? true : filter === 'todo' ? !c.summarized : c.summarized))
      .filter((c) => !kw || (c.title + ' ' + c.messages.map((m) => m.text).join(' ')).toLowerCase().includes(kw))
      .sort((a, b) => b.date - a.date)
  }, [store.chats, q, filter])

  const todo = store.chats.filter((c) => !c.summarized)
  const open = store.chats.find((c) => c.id === openId)
  const hasKey = !!store.settings.apiKey.trim()

  const runBulk = async () => {
    setBulk({ running: true, log: [] })
    const log: string[] = []
    for (const c of todo) {
      try {
        const parts = splitParts(c)
        let mem = 0
        let rul = 0
        for (let i = 0; i < parts.length; i++) {
          const reply = await summarizeWithApi(store.settings, buildSummaryPrompt(c, parts[i], i + 1, parts.length))
          const s = parseSummary(reply)
          store.addNotes([...s.memories.map((text) => ({ kind: 'memory' as const, text, chatId: c.id })), ...s.rules.map((text) => ({ kind: 'rule' as const, text, chatId: c.id }))])
          mem += s.memories.length
          rul += s.rules.length
        }
        store.updateChat(c.id, { summarized: true })
        log.push(`✔ ${c.title}：記憶 ${mem} 件・教本 ${rul} 件`)
      } catch (e) {
        log.push(`✖ ${c.title}：${e instanceof Error ? e.message : '失敗しました'}（ここで止めました）`)
        setBulk({ running: false, log: [...log] })
        return
      }
      setBulk({ running: true, log: [...log] })
    }
    setBulk({ running: false, log })
  }

  return (
    <>
      {store.chats.length === 0 && (
        <section className="card empty">
          <p>まだチャットがありません。「取り込む」で、ファイルの読み込み・貼り付け・見本データを使えます。</p>
          <button type="button" className="btn main" onClick={goImport}>
            「取り込む」へ
          </button>
        </section>
      )}

      {store.chats.length > 0 && (
        <>
          <section className="card">
            <div className="search">
              <label className="lab" htmlFor="q">
                キーワードで探す（題名と本文）
              </label>
              <input id="q" className="in" value={q} onChange={(e) => setQ(e.target.value)} placeholder="例：引っ越し" />
            </div>
            <div className="chips" role="group" aria-label="絞り込み">
              {([['all', `すべて（${store.chats.length}）`], ['todo', `未要約（${todo.length}）`], ['done', `要約済み（${store.chats.length - todo.length}）`]] as [Filter, string][]).map(([k, l]) => (
                <button key={k} type="button" className={'chip' + (filter === k ? ' on' : '')} onClick={() => setFilter(k)} aria-pressed={filter === k}>
                  {l}
                </button>
              ))}
            </div>
            <p className="hint">検索と閲覧は、AI を使わず、無料で動きます。新しい順に並びます。</p>
          </section>

          <section className="card bulk">
            <h2>まとめて自動で要約する（やり方B）</h2>
            {hasKey ? (
              <>
                <p className="hint">
                  未要約の {todo.length} 件を、順に要約して、記憶と教本へ振り分けます。<b>押すと、各チャットの本文を {PROVIDER_HOST[store.settings.provider]} へ送ります。</b>
                </p>
                <div className="row">
                  {todo.length > 0 && !bulk.running && <ConfirmButton className="btn main" label={`未要約 ${todo.length} 件を、自動で要約する`} onYes={runBulk} />}
                  {bulk.running && <span className="hint">要約中…（止めるには、このページを閉じてください）</span>}
                </div>
                {bulk.log.length > 0 && (
                  <ul className="log" aria-live="polite">
                    {bulk.log.map((l, i) => (
                      <li key={i} className={l.startsWith('✖') ? 'bad' : ''}>
                        {l}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <p className="hint">
                API キーを持っている人向けです。<button type="button" className="link" onClick={goSettings}>設定</button>に自分のキーを入れると使えます。キーが無いときは、下の各チャットで、無料の「半自動（コピー＆貼り戻し）」を使えます。
              </p>
            )}
          </section>

          <ul className="chat-list">
            {list.map((c) => (
              <li key={c.id}>
                <button type="button" className={'chat-row' + (c.id === openId ? ' on' : '')} onClick={() => setOpenId(c.id === openId ? '' : c.id)} aria-expanded={c.id === openId}>
                  <span className="t">{c.title}</span>
                  <span className="meta">
                    <span className={'src src-' + c.source}>{SOURCE_LABEL[c.source]}</span>
                    <span>{fmtDate(c.date)}</span>
                    <span>{c.messages.length}件</span>
                    <span className={'st ' + (c.summarized ? 'done' : 'todo')}>{c.summarized ? '要約済み' : '未要約'}</span>
                    {c.sample && <span className="st sample">見本</span>}
                  </span>
                </button>
                {c.id === openId && open && <ChatDetail key={c.id} chat={open} store={store} onClose={() => setOpenId('')} />}
              </li>
            ))}
            {list.length === 0 && <li className="hint">条件に合うチャットがありません。</li>}
          </ul>
        </>
      )}
    </>
  )
}

function ChatDetail({ chat, store, onClose }: { chat: Chat; store: Store; onClose: () => void }) {
  const parts = useMemo(() => splitParts(chat), [chat])
  const [part, setPart] = useState(0)
  const [pasted, setPasted] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const prompt = buildSummaryPrompt(chat, parts[part] ?? '', part + 1, parts.length)
  const parsed = useMemo(() => parseSummary(pasted), [pasted])
  const found = parsed.memories.length + parsed.rules.length
  const hasKey = !!store.settings.apiKey.trim()
  const notes = store.notes.filter((n) => n.chatId === chat.id)

  const save = () => {
    if (!found) {
      setInfo('【記憶】【教本】の項目が見つかりませんでした。返ってきた文を、そのまま貼ってください。')
      return
    }
    store.addNotes([...parsed.memories.map((text) => ({ kind: 'memory' as const, text, chatId: chat.id })), ...parsed.rules.map((text) => ({ kind: 'rule' as const, text, chatId: chat.id }))])
    setPasted('')
    if (part >= parts.length - 1) {
      store.updateChat(chat.id, { summarized: true })
      setInfo(`保存しました（記憶 ${parsed.memories.length} 件・教本 ${parsed.rules.length} 件）。このチャットは「要約済み」になりました。`)
    } else {
      setInfo(`保存しました（記憶 ${parsed.memories.length} 件・教本 ${parsed.rules.length} 件）。次は、${part + 2} / ${parts.length} 番目のお願い文です。`)
      setPart(part + 1)
    }
  }

  const auto = async () => {
    setBusy(true)
    setInfo('')
    try {
      let mem = 0
      let rul = 0
      for (let i = 0; i < parts.length; i++) {
        const reply = await summarizeWithApi(store.settings, buildSummaryPrompt(chat, parts[i], i + 1, parts.length))
        const s = parseSummary(reply)
        store.addNotes([...s.memories.map((text) => ({ kind: 'memory' as const, text, chatId: chat.id })), ...s.rules.map((text) => ({ kind: 'rule' as const, text, chatId: chat.id }))])
        mem += s.memories.length
        rul += s.rules.length
      }
      store.updateChat(chat.id, { summarized: true })
      setInfo(`自動で要約しました（記憶 ${mem} 件・教本 ${rul} 件）。`)
    } catch (e) {
      setInfo(e instanceof Error ? e.message : '失敗しました')
    }
    setBusy(false)
  }

  const shown = showAll ? chat.messages : chat.messages.slice(0, 6)
  return (
    <div className="detail">
      <div className="detail-head">
        <h3>{chat.title}</h3>
        <div className="row">
          <button type="button" className="btn sub" onClick={() => store.updateChat(chat.id, { summarized: !chat.summarized })}>
            {chat.summarized ? '未要約に戻す' : '要約済みにする'}
          </button>
          <ConfirmButton label="このチャットを削除" onYes={() => { store.removeChat(chat.id); onClose() }} />
        </div>
      </div>

      <div className="msgs">
        {shown.map((m, i) => (
          <p key={i} className={'msg ' + m.role}>
            <b>{m.role === 'user' ? '私' : m.role === 'ai' ? 'AI' : '本文'}</b>
            {m.text}
          </p>
        ))}
        {chat.messages.length > 6 && (
          <button type="button" className="link" onClick={() => setShowAll(!showAll)}>
            {showAll ? '先頭の6件だけ表示する' : `残り ${chat.messages.length - 6} 件も表示する`}
          </button>
        )}
      </div>

      <div className="way">
        <h4>やり方A：半自動で要約する（無料枠・API キー不要）</h4>
        <ol>
          <li>
            「お願い文をコピー」を押す{parts.length > 1 && <>（長いため {parts.length} 分割。いまは {part + 1} / {parts.length} 番目）</>}。
          </li>
          <li>ふだん使っている Gemini / ChatGPT / Claude に貼って、返事をもらう。</li>
          <li>返ってきた文を、下の枠に貼り、「記憶と教本に保存」を押す。</li>
        </ol>
        {parts.length > 1 && (
          <div className="row">
            <button type="button" className="btn sub" onClick={() => setPart(Math.max(0, part - 1))} disabled={part === 0}>
              前の部分
            </button>
            <button type="button" className="btn sub" onClick={() => setPart(Math.min(parts.length - 1, part + 1))} disabled={part >= parts.length - 1}>
              次の部分
            </button>
          </div>
        )}
        <div className="row">
          <CopyButton text={prompt} label="お願い文（履歴つき）をコピー" />
          <span className="hint">{prompt.length.toLocaleString()} 字</span>
        </div>
        <label className="lab" htmlFor="pasteback">
          AI から返ってきた文
        </label>
        <textarea id="pasteback" className="in" rows={6} value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder={'【記憶】\n- …\n【教本】\n- …'} />
        {pasted.trim() && (
          <p className="found" aria-live="polite">
            見つかった項目：記憶 {parsed.memories.length} 件・教本 {parsed.rules.length} 件
          </p>
        )}
        <div className="row">
          <button type="button" className="btn main" onClick={save}>
            記憶と教本に保存
          </button>
        </div>
      </div>

      <div className="way">
        <h4>やり方B：自動で要約する（自分の API キーがある人向け）</h4>
        {hasKey ? (
          <>
            <p className="hint">
              押すと、このチャットの本文を {PROVIDER_HOST[store.settings.provider]} へ送ります。
            </p>
            <ConfirmButton className="btn main" label={busy ? '要約中…' : 'このチャットを自動で要約する'} onYes={auto} />
          </>
        ) : (
          <p className="hint">「設定」で API キーを入れると使えます。キーが無いときは、通信は一切行いません。</p>
        )}
      </div>

      {info && (
        <p className="info" role="status">
          {info}
        </p>
      )}
      {notes.length > 0 && (
        <p className="hint">このチャットから保存した項目：記憶 {notes.filter((n) => n.kind === 'memory').length} 件・教本 {notes.filter((n) => n.kind === 'rule').length} 件（「記憶と教本」で編集できます）</p>
      )}
    </div>
  )
}

// ---------------- 記憶と教本の管理 ----------------
function NotesPane({ store }: { store: Store }) {
  const [kind, setKind] = useState<Note['kind']>('memory')
  const [text, setText] = useState('')
  const list = store.notes.filter((n) => n.kind === kind).sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt - a.createdAt)
  const label = kind === 'memory' ? '記憶（出来事・決めたこと）' : '教本（好み・ルール・前提）'
  return (
    <>
      <div className="chips" role="group" aria-label="種類">
        <button type="button" className={'chip' + (kind === 'memory' ? ' on' : '')} onClick={() => setKind('memory')} aria-pressed={kind === 'memory'}>
          記憶（{store.notes.filter((n) => n.kind === 'memory').length}）
        </button>
        <button type="button" className={'chip' + (kind === 'rule' ? ' on' : '')} onClick={() => setKind('rule')} aria-pressed={kind === 'rule'}>
          教本（{store.notes.filter((n) => n.kind === 'rule').length}）
        </button>
      </div>
      <p className="hint">
        {kind === 'memory'
          ? '「いつも含める」にした記憶は、どの相談の引き継ぎ文にも入ります。ほかは、相談したいことに近いものだけが選ばれます。'
          : '「いつも含める」にした教本は、どの相談の引き継ぎ文にも入ります。オフにした教本は、入りません。'}
      </p>
      <section className="card">
        <label className="lab" htmlFor="new-note">
          {label}を、自分で足す
        </label>
        <div className="row grow">
          <input id="new-note" className="in" value={text} onChange={(e) => setText(e.target.value)} placeholder={kind === 'memory' ? '例：来月、引っ越す予定' : '例：結論を先に、短く答えてほしい'} />
          <button
            type="button"
            className="btn main"
            onClick={() => {
              store.addNotes([{ kind, text, pinned: kind === 'rule' }])
              setText('')
            }}
            disabled={!text.trim()}
          >
            追加
          </button>
        </div>
      </section>
      <ul className="notes">
        {list.map((n) => (
          <NoteCard key={n.id} note={n} store={store} />
        ))}
        {list.length === 0 && <li className="hint">まだありません。チャットを要約すると、ここに並びます。</li>}
      </ul>
    </>
  )
}

function NoteCard({ note, store }: { note: Note; store: Store }) {
  const [text, setText] = useState(note.text)
  const chat = store.chats.find((c) => c.id === note.chatId)
  return (
    <li className={'card note' + (note.pinned ? ' pinned' : '')}>
      <textarea
        className="in"
        rows={2}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          const t = text.trim()
          if (t && t !== note.text) store.updateNote(note.id, { text: t })
          else setText(note.text)
        }}
        aria-label={note.kind === 'memory' ? '記憶の文' : '教本の文'}
      />
      <div className="note-foot">
        <label className="pin">
          <input type="checkbox" checked={note.pinned} onChange={(e) => store.updateNote(note.id, { pinned: e.target.checked })} />
          いつも引き継ぎに含める
        </label>
        <span className="hint">{chat ? `元：${chat.title}（${fmtDate(chat.date)}）` : note.sample ? '見本' : '自分で追加'}</span>
        <ConfirmButton label="削除" onYes={() => store.removeNote(note.id)} className="btn sub small" />
      </div>
    </li>
  )
}
