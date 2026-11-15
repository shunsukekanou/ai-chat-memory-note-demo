import { useMemo, useState } from 'react'
import { buildHandoff, pickRelevant } from './lib/prompts'
import { fmtDate } from './lib/types'
import { CopyButton, type Store } from './ui'

export default function HandoffView({ store, goOrganize }: { store: Store; goOrganize: () => void }) {
  const [topic, setTopic] = useState('')
  const [max, setMax] = useState(6)
  const [over, setOver] = useState<Record<string, boolean>>({})

  const memories = store.notes.filter((n) => n.kind === 'memory')
  const rules = store.notes.filter((n) => n.kind === 'rule')
  const auto = useMemo(() => pickRelevant(topic, memories.filter((n) => !n.pinned), store.chats, max), [topic, memories, store.chats, max])
  const autoIds = new Set(auto.map((n) => n.id))
  const inc = (id: string, def: boolean) => over[id] ?? def

  const rulesUsed = rules.filter((r) => inc(r.id, r.pinned))
  const pinnedMem = memories.filter((m) => m.pinned && inc(m.id, true))
  const memUsed = [...pinnedMem, ...memories.filter((m) => !m.pinned && inc(m.id, autoIds.has(m.id)))]
  const text = buildHandoff(topic, rulesUsed, memUsed, store.chats)
  const empty = store.notes.length === 0

  return (
    <>
      <section className="card">
        <label className="lab" htmlFor="topic">
          今日相談したいこと（テーマや質問）
        </label>
        <textarea id="topic" className="in" rows={3} value={topic} onChange={(e) => { setTopic(e.target.value); setOver({}) }} placeholder="例：引っ越しの荷造りを、週末だけで終わらせたい" />
        <div className="row">
          <label className="gap">
            関連する記憶は、最大
            <select value={max} onChange={(e) => setMax(Number(e.target.value))} aria-label="記憶の最大件数">
              {[3, 6, 10, 15].map((n) => (
                <option key={n} value={n}>
                  {n}件
                </option>
              ))}
            </select>
            まで選ぶ
          </label>
        </div>
      </section>

      {empty && (
        <section className="card empty">
          <p>まだ記憶と教本がありません。チャットを要約すると、ここで引き継ぎ文に使えます。</p>
          <button type="button" className="btn main" onClick={goOrganize}>
            「整理する」へ
          </button>
        </section>
      )}

      <div className="two">
        <section className="card">
          <h2>入れる教本（{rulesUsed.length}件）</h2>
          <ul className="picks">
            {rules.map((r) => (
              <li key={r.id}>
                <label>
                  <input type="checkbox" checked={inc(r.id, r.pinned)} onChange={(e) => setOver({ ...over, [r.id]: e.target.checked })} />
                  <span>{r.text}</span>
                </label>
              </li>
            ))}
            {rules.length === 0 && <li className="hint">教本はまだありません。</li>}
          </ul>
          <p className="hint">「整理する」で「いつも引き継ぎに含める」をオンにした教本が、最初から選ばれます。</p>
        </section>
        <section className="card">
          <h2>入れる記憶（{memUsed.length}件）</h2>
          <ul className="picks">
            {memories.map((m) => {
              const def = m.pinned || autoIds.has(m.id)
              const chat = store.chats.find((c) => c.id === m.chatId)
              return (
                <li key={m.id} className={def ? 'auto' : ''}>
                  <label>
                    <input type="checkbox" checked={inc(m.id, def)} onChange={(e) => setOver({ ...over, [m.id]: e.target.checked })} />
                    <span>
                      {m.text}
                      <small>
                        {m.pinned ? '　いつも含める' : autoIds.has(m.id) ? '　相談に近いため、自動で選びました' : ''}
                        {chat ? `　（${fmtDate(chat.date)}・${chat.title}）` : ''}
                      </small>
                    </span>
                  </label>
                </li>
              )
            })}
            {memories.length === 0 && <li className="hint">記憶はまだありません。</li>}
          </ul>
          {topic.trim() && auto.length === 0 && <p className="hint">相談したいことに近い記憶は、見つかりませんでした。必要なものは、チェックで足せます。</p>}
        </section>
      </div>

      <section className="card out">
        <div className="out-head">
          <h2>引き継ぎ文（ChatGPT・Gemini・Claude のどれにも、そのまま貼れます）</h2>
          <CopyButton text={text} label="引き継ぎ文をコピー" />
        </div>
        <textarea id="handoff-out" className="in out-text" readOnly rows={14} value={text} aria-label="引き継ぎ文" />
        <p className="hint">{text.length.toLocaleString()} 字。コピーしたら、新しいチャットの入力欄に貼り付けます。</p>
      </section>
    </>
  )
}
