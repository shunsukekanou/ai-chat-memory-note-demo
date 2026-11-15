import { useState } from 'react'
import { parseExport, pastedChat } from './lib/parse'
import { SOURCE_LABEL, type Source } from './lib/types'
import { ConfirmButton, type Store } from './ui'

function today(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function ImportView({ store, goOrganize }: { store: Store; goOrganize: () => void }) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string[] } | null>(null)
  const [over, setOver] = useState(false)
  const [pTitle, setPTitle] = useState('')
  const [pSource, setPSource] = useState<Source>('chatgpt')
  const [pDate, setPDate] = useState(today())
  const [pText, setPText] = useState('')
  const total = store.chats.length
  const unsum = store.chats.filter((c) => !c.summarized).length
  const hasSample = store.chats.some((c) => c.sample)

  const readFiles = async (files: FileList | File[]) => {
    const lines: string[] = []
    let ok = true
    for (const f of Array.from(files)) {
      try {
        const text = await f.text()
        const r = parseExport(text, f.name, store.settings.gapMinutes)
        const { added, skipped } = store.addChats(r.chats)
        lines.push(`「${f.name}」：${r.kind}。${r.notes.join('')} 新しく ${added} 件を追加${skipped ? `（${skipped} 件は取り込み済みのため飛ばしました）` : ''}。`)
      } catch (e) {
        ok = false
        lines.push(`「${f.name}」：${e instanceof Error ? e.message : '読み込めませんでした。'}`)
      }
    }
    setMsg({ ok, text: lines })
  }

  const savePasted = () => {
    if (!pText.trim()) {
      setMsg({ ok: false, text: ['貼り付ける欄が空です。チャットの本文を貼ってください。'] })
      return
    }
    const t = pDate ? new Date(pDate + 'T12:00:00').getTime() : 0
    const { added } = store.addChats([pastedChat(pSource, pTitle, t, pText)])
    if (added) {
      setMsg({ ok: true, text: ['チャットを1件、保存しました。'] })
      setPText('')
      setPTitle('')
    } else setMsg({ ok: false, text: ['同じ題名・日付のチャットが、すでに入っています。題名か日付を変えてください。'] })
  }

  return (
    <>
      <section className="card stats" aria-label="いまの保管状況">
        <div>
          <b>{total}</b>
          <span>チャット</span>
        </div>
        <div>
          <b>{unsum}</b>
          <span>未要約</span>
        </div>
        <div>
          <b>{store.notes.filter((n) => n.kind === 'memory').length}</b>
          <span>記憶</span>
        </div>
        <div>
          <b>{store.notes.filter((n) => n.kind === 'rule').length}</b>
          <span>教本</span>
        </div>
      </section>

      {msg && (
        <section className={'card result' + (msg.ok ? '' : ' bad')} role="status">
          {msg.text.map((t, i) => (
            <p key={i}>{t}</p>
          ))}
          {msg.ok && total > 0 && (
            <button type="button" className="btn main" onClick={goOrganize}>
              「整理する」へ進む
            </button>
          )}
        </section>
      )}

      <section
        className={'card drop' + (over ? ' over' : '')}
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setOver(false)
          void readFiles(e.dataTransfer.files)
        }}
      >
        <h2>① 書き出したファイルを読み込む</h2>
        <p className="hint">Gemini（Google データ エクスポートの JSON／HTML）、ChatGPT と Claude の conversations.json を、ドラッグするか、ボタンで選びます（複数選べます）。</p>
        <div className="row">
          <label className="btn main">
            ファイルを選ぶ
            <input
              id="file-input"
              type="file"
              accept=".json,.html,.htm,application/json,text/html"
              multiple
              hidden
              onChange={(e) => {
                if (e.target.files) void readFiles(e.target.files)
                e.target.value = ''
              }}
            />
          </label>
          <label className="gap">
            Gemini の記録は、
            <select value={store.settings.gapMinutes} onChange={(e) => store.changeSettings({ gapMinutes: Number(e.target.value) })} aria-label="会話に分ける間隔">
              <option value={15}>15分</option>
              <option value={30}>30分</option>
              <option value={60}>1時間</option>
              <option value={180}>3時間</option>
            </select>
            以上あいたら、別の会話に分ける
          </label>
        </div>
        <p className="hint">Google の記録は、スレッド（会話）ごとではなく、時刻つきの記録の並びです。そのため、上の間隔で会話のまとまりに分けます。</p>

        <details className="guide">
          <summary>書き出し方の案内（Gemini・ChatGPT・Claude）</summary>
          <h3>Gemini（Google データ エクスポート）</h3>
          <ol>
            <li>ブラウザで takeout.google.com を開く（Gemini と同じ Google アカウントでログイン）。</li>
            <li>「選択をすべて解除」を押す。</li>
            <li>「マイ アクティビティ」のチェックをオンにし、「すべてのアクティビティ データが含まれます」を選ぶ。出てきた窓で、いったんすべて解除してから「Gemini アプリ」をオンにして「OK」。</li>
            <li>いちばん下の「次のステップ」を押し、受け取り方法・「1 回のエクスポート」・ファイル形式（.zip か .tgz）を選んで「エクスポートを作成」。</li>
            <li>用意ができると、Google からリンクのメールが届く（数時間〜数日かかることがある）。ダウンロードした zip を開き、中の MyActivity のファイルをここへ入れる。</li>
          </ol>
          <p className="hint">
            ここまでは Google の公式ヘルプ（support.google.com/gemini/answer/16920332）の案内に基づきます。ただし、<b>「マイ アクティビティ」の中身を JSON と HTML のどちらで書き出せるかは、この公式の案内に載っておらず、確認できていません</b>。選べないときは、入っていたファイルをそのまま読み込んでください。このアプリの読み取りは、実際のファイルでの確認ができていないため、うまく読めないときは、下の「貼り付けて取り込む」を使ってください。
          </p>
          <h3>ChatGPT</h3>
          <p>
            検索で見えた案内では、「設定 → データ コントロール → エクスポート」の順で書き出すと、zip の中に conversations.json が入っています。<b>OpenAI の公式ヘルプのページを、こちらでは直接開けず（アクセスを断られました）、画面の名前は確認できていません</b>。ChatGPT の画面で、実際の名前を確かめてください。
          </p>
          <h3>Claude</h3>
          <p>
            公式ヘルプ（support.claude.com/en/articles/9450526）では、Web 版か Claude Desktop の「Settings &gt; Privacy」を開き、「Export data」を押す、とあります（スマホアプリからはできない記載）。ダウンロードのリンクは、作ってから24時間で切れ、1回しか使えない場合があるため、届いたらすぐ保存してください。zip の中の conversations.json をここへ入れます。
          </p>
          <p className="hint">Claude と ChatGPT のファイルの読み取りは、公開されている形式の知識にもとづいており、実際の自分のファイルでの確認ができていません。読めないときは「貼り付けて取り込む」を使ってください。</p>
        </details>
      </section>

      <section className="card">
        <h2>② 貼り付けて取り込む（チャット1本分）</h2>
        <div className="grid2">
          <div>
            <label className="lab" htmlFor="p-title">
              題名
            </label>
            <input id="p-title" className="in" value={pTitle} onChange={(e) => setPTitle(e.target.value)} placeholder="例：引っ越しの段取り（空なら本文の先頭）" />
          </div>
          <div className="grid2s">
            <div>
              <label className="lab" htmlFor="p-source">
                AIの種類
              </label>
              <select id="p-source" className="in" value={pSource} onChange={(e) => setPSource(e.target.value as Source)}>
                {(Object.keys(SOURCE_LABEL) as Source[]).map((s) => (
                  <option key={s} value={s}>
                    {SOURCE_LABEL[s]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="lab" htmlFor="p-date">
                日付
              </label>
              <input id="p-date" type="date" className="in" value={pDate} onChange={(e) => setPDate(e.target.value)} />
            </div>
          </div>
        </div>
        <label className="lab" htmlFor="p-text">
          チャットの本文
        </label>
        <textarea id="p-text" className="in" rows={6} value={pText} onChange={(e) => setPText(e.target.value)} placeholder="AI の画面からコピーした、やり取りの全部を貼ってください" />
        <div className="row">
          <button type="button" className="btn main" onClick={savePasted}>
            保存する
          </button>
        </div>
      </section>

      <section className="card">
        <h2>③ お試し用の見本データ</h2>
        <p className="hint">架空の日常相談・仕事相談の履歴（5件）と、記憶・教本の例が入ります。自分のデータとは混ざらず、あとで「見本を消す」で消せます。</p>
        <div className="row">
          <button type="button" className="btn sub" onClick={() => { store.loadSample(); setMsg({ ok: true, text: ['見本データを読み込みました（チャット5件・記憶と教本の例）。'] }) }} disabled={hasSample}>
            見本データを読み込む
          </button>
          {hasSample && <ConfirmButton label="見本を消す" onYes={() => { store.removeSamples(); setMsg({ ok: true, text: ['見本データを消しました。'] }) }} />}
        </div>
      </section>
    </>
  )
}
