import { useState, useRef } from 'react'
import { analyzeFA, ocrFA, analyzeAddDrop } from '../api'
import { loadSettings, saveSettings, listRosters, loadRoster } from '../store'
import PRBadge from '../components/PRBadge'
import LoadingSpinner from '../components/LoadingSpinner'
import CategoryPicker from '../components/CategoryPicker'

export default function FAPage() {
  const settings = loadSettings()

  // ── Per-page category state ──────────────────────
  const [bCats, setBCats] = useState(
    () => loadSettings().faBattingCategories || ['H','HR','RBI','SB','AVG','BB','2B','3B','K']
  )
  const [pCats, setPCats] = useState(
    () => loadSettings().faPitchingCategories || ['W','SV','ERA','WHIP','SO','HLD','BB','IP']
  )

  function handleBCatsChange(cats) {
    setBCats(cats)
    saveSettings({ ...loadSettings(), faBattingCategories: cats })
  }
  function handlePCatsChange(cats) {
    setPCats(cats)
    saveSettings({ ...loadSettings(), faPitchingCategories: cats })
  }

  // ── FA Analysis state ────────────────────────────
  const [batters, setBatters] = useState('')
  const [pitchers, setPitchers] = useState('')
  const [loading, setLoading] = useState(false)
  const [ocrLoading, setOcrLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [inputTab, setInputTab] = useState('batters')
  const [resultTab, setResultTab] = useState('batters')
  const fileInputRef = useRef(null)

  // ── Add/Drop state ───────────────────────────────
  const [adTab, setAdTab] = useState('fa')          // 'fa' | 'addDrop'
  const [savedRosters] = useState(listRosters)
  const [adRosterName, setAdRosterName] = useState('')
  const [adRoster, setAdRoster] = useState(null)    // { batters: [], pitchers: [] }
  const [adDropPlayer, setAdDropPlayer] = useState('')
  const [adDropType, setAdDropType] = useState('batter')
  const [adAddPlayer, setAdAddPlayer] = useState('')
  const [adLoading, setAdLoading] = useState(false)
  const [adResult, setAdResult] = useState(null)
  const [adError, setAdError] = useState('')

  function parseNames(text) {
    return text.split('\n').map(s => s.trim()).filter(Boolean)
  }

  // ── FA Analysis ──────────────────────────────────
  async function handleAnalyze() {
    const bList = parseNames(batters)
    const pList = parseNames(pitchers)
    if (!bList.length && !pList.length) {
      setError('請輸入 FA 球員名字')
      return
    }
    setError('')
    setLoading(true)
    try {
      const data = await analyzeFA(
        bList, pList,
        settings.year, settings.period,
        bCats, pCats,
      )
      setResult(data)
      if (data.batters?.length > 0) setResultTab('batters')
      else if (data.pitchers?.length > 0) setResultTab('pitchers')
    } catch (e) {
      setError(e.response?.data?.detail || e.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleOCR(e) {
    const file = e.target.files[0]
    if (!file) return
    setOcrLoading(true)
    setError('')
    try {
      const data = await ocrFA(file)
      const names = data.players || []
      setBatters(prev => {
        const existing = prev.trim()
        return existing ? existing + '\n' + names.join('\n') : names.join('\n')
      })
    } catch (e) {
      setError(e.message)
    } finally {
      setOcrLoading(false)
      e.target.value = ''
    }
  }

  // ── Add/Drop ─────────────────────────────────────
  function handleLoadRoster(name) {
    const r = loadRoster(name)
    if (r) {
      setAdRoster(r)
      setAdRosterName(name)
      setAdDropPlayer('')
      setAdResult(null)
    }
  }

  // Determine dropType from which list the player came from
  function handleDropSelect(player) {
    setAdDropPlayer(player)
    if (adRoster?.batters?.includes(player)) setAdDropType('batter')
    else setAdDropType('pitcher')
    setAdResult(null)
  }

  async function handleAddDrop() {
    if (!adRoster) { setAdError('請先選擇陣容'); return }
    if (!adDropPlayer) { setAdError('請選擇要 Drop 的球員'); return }
    if (!adAddPlayer.trim()) { setAdError('請輸入要 Add 的球員名字'); return }
    setAdError('')
    setAdLoading(true)
    try {
      const data = await analyzeAddDrop(
        adRoster.batters, adRoster.pitchers,
        adDropPlayer, adAddPlayer.trim(), adDropType,
        settings.year, settings.period,
        bCats, pCats,
      )
      setAdResult(data)
    } catch (e) {
      setAdError(e.response?.data?.detail || e.message)
    } finally {
      setAdLoading(false)
    }
  }

  // Combined player list for Drop selector
  const dropOptions = adRoster
    ? [
        ...(adRoster.batters || []).map(n => ({ name: n, type: 'batter', label: `[打] ${n}` })),
        ...(adRoster.pitchers || []).map(n => ({ name: n, type: 'pitcher', label: `[投] ${n}` })),
      ]
    : []

  return (
    <div className="page-content">
      <div className="p-4 space-y-4">
        <div>
          <h1 className="text-lg font-bold text-white">FA 球員分析</h1>
          <p className="text-xs text-slate-400">{settings.year} · {settings.period === 'season' ? '全季' : '近30天'} · 依 PR 排名</p>
        </div>

        {/* Top-level tabs: FA Analysis | Add/Drop */}
        <div className="flex rounded-xl overflow-hidden border border-slate-700">
          <button
            onClick={() => setAdTab('fa')}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${adTab === 'fa' ? 'bg-slate-700 text-white' : 'text-slate-400'}`}
          >
            🔍 FA 分析
          </button>
          <button
            onClick={() => setAdTab('addDrop')}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${adTab === 'addDrop' ? 'bg-slate-700 text-white' : 'text-slate-400'}`}
          >
            ⚖️ Add/Drop
          </button>
        </div>

        {/* ── FA Analysis tab ─────────────────────── */}
        {adTab === 'fa' && (
          <>
            {/* OCR */}
            <div className="bg-slate-800 rounded-xl p-3">
              <p className="text-xs text-slate-400 mb-2">上傳 FA 列表截圖自動識別</p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleOCR}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={ocrLoading}
                className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium py-2.5 rounded-lg transition-colors"
              >
                {ocrLoading ? '識別中...' : '📸 上傳截圖（自動 OCR）'}
              </button>
            </div>

            {/* Input tabs */}
            <div className="bg-slate-800 rounded-xl overflow-hidden">
              <div className="flex border-b border-slate-700">
                <button
                  onClick={() => setInputTab('batters')}
                  className={`flex-1 py-2.5 text-sm font-medium ${inputTab === 'batters' ? 'text-white bg-slate-700' : 'text-slate-400'}`}
                >
                  FA 打者
                </button>
                <button
                  onClick={() => setInputTab('pitchers')}
                  className={`flex-1 py-2.5 text-sm font-medium ${inputTab === 'pitchers' ? 'text-white bg-slate-700' : 'text-slate-400'}`}
                >
                  FA 投手
                </button>
              </div>
              <div className="p-3">
                {inputTab === 'batters' ? (
                  <textarea
                    value={batters}
                    onChange={e => setBatters(e.target.value)}
                    placeholder={"每行一個 FA 打者名字\nLuis Arraez\nJake McCarthy"}
                    rows={6}
                    className="w-full bg-slate-900 text-slate-200 text-sm p-2 rounded-lg border border-slate-600 focus:outline-none focus:border-blue-500 resize-none"
                  />
                ) : (
                  <textarea
                    value={pitchers}
                    onChange={e => setPitchers(e.target.value)}
                    placeholder={"每行一個 FA 投手名字\nTylor Megill\nJoely Rodriguez"}
                    rows={6}
                    className="w-full bg-slate-900 text-slate-200 text-sm p-2 rounded-lg border border-slate-600 focus:outline-none focus:border-blue-500 resize-none"
                  />
                )}
              </div>
            </div>

            {/* Category picker */}
            <CategoryPicker
              batting={bCats}
              pitching={pCats}
              onBattingChange={handleBCatsChange}
              onPitchingChange={handlePCatsChange}
            />

            <button
              onClick={handleAnalyze}
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold py-3.5 rounded-xl text-base transition-colors"
            >
              {loading ? '分析中...' : '🔍 開始 FA 分析'}
            </button>

            {error && (
              <div className="bg-red-900/50 border border-red-700 text-red-300 text-sm rounded-xl p-3">
                {error}
              </div>
            )}

            {loading && <LoadingSpinner message="正在計算 FA 球員 PR 排名..." />}

            {/* Results */}
            {result && !loading && (
              <div className="space-y-4">
                {(result.unmatched_batters?.length > 0 || result.unmatched_pitchers?.length > 0) && (
                  <div className="bg-yellow-900/40 border border-yellow-700 rounded-xl p-3">
                    <p className="text-yellow-300 text-sm font-medium mb-1">⚠️ 找不到的球員</p>
                    {result.unmatched_batters?.length > 0 && (
                      <p className="text-yellow-200 text-xs">打者：{result.unmatched_batters.join('、')}</p>
                    )}
                    {result.unmatched_pitchers?.length > 0 && (
                      <p className="text-yellow-200 text-xs">投手：{result.unmatched_pitchers.join('、')}</p>
                    )}
                  </div>
                )}

                <div className="flex rounded-xl overflow-hidden border border-slate-700">
                  <button
                    onClick={() => setResultTab('batters')}
                    className={`flex-1 py-2 text-sm font-medium ${resultTab === 'batters' ? 'bg-slate-700 text-white' : 'text-slate-400'}`}
                  >
                    打者 ({result.batters?.length || 0})
                  </button>
                  <button
                    onClick={() => setResultTab('pitchers')}
                    className={`flex-1 py-2 text-sm font-medium ${resultTab === 'pitchers' ? 'bg-slate-700 text-white' : 'text-slate-400'}`}
                  >
                    投手 ({result.pitchers?.length || 0})
                  </button>
                </div>

                {resultTab === 'batters' && result.batters?.length > 0 && (
                  <FAResultList rows={result.batters} categories={bCats} />
                )}
                {resultTab === 'pitchers' && result.pitchers?.length > 0 && (
                  <FAResultList rows={result.pitchers} categories={pCats} />
                )}
              </div>
            )}
          </>
        )}

        {/* ── Add/Drop tab ─────────────────────────── */}
        {adTab === 'addDrop' && (
          <div className="space-y-4">
            <p className="text-xs text-slate-400">從已儲存陣容選擇一名球員 Drop，填入要 Add 的 FA，計算陣容 PR 變化。</p>

            {/* 1. Select saved roster */}
            <div className="bg-slate-800 rounded-xl p-3 space-y-2">
              <p className="text-xs text-slate-400 font-medium">選擇陣容</p>
              {savedRosters.length === 0 ? (
                <p className="text-slate-500 text-sm">尚無儲存的陣容，請先在「我的陣容」頁面儲存。</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {savedRosters.map(r => (
                    <button
                      key={r.name}
                      onClick={() => handleLoadRoster(r.name)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                        adRosterName === r.name
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-700 text-slate-300'
                      }`}
                    >
                      {r.name}
                      <span className="text-slate-400 ml-1">({r.batters.length}打/{r.pitchers.length}投)</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* 2. Select drop player */}
            {adRoster && (
              <div className="bg-slate-800 rounded-xl p-3 space-y-2">
                <p className="text-xs text-slate-400 font-medium">Drop 球員</p>
                <select
                  value={adDropPlayer}
                  onChange={e => handleDropSelect(e.target.value)}
                  className="w-full bg-slate-900 text-slate-200 text-sm px-3 py-2.5 rounded-lg border border-slate-600 focus:outline-none focus:border-blue-500"
                >
                  <option value="">-- 選擇要 Drop 的球員 --</option>
                  {dropOptions.map(o => (
                    <option key={o.name} value={o.name}>{o.label}</option>
                  ))}
                </select>
              </div>
            )}

            {/* 3. Add player */}
            {adRoster && (
              <div className="bg-slate-800 rounded-xl p-3 space-y-2">
                <p className="text-xs text-slate-400 font-medium">Add 球員</p>
                <input
                  value={adAddPlayer}
                  onChange={e => { setAdAddPlayer(e.target.value); setAdResult(null) }}
                  placeholder="輸入 FA 球員名字（英文全名）"
                  className="w-full bg-slate-900 text-slate-200 text-sm px-3 py-2.5 rounded-lg border border-slate-600 focus:outline-none focus:border-blue-500"
                />
              </div>
            )}

            {/* Category picker */}
            <CategoryPicker
              batting={bCats}
              pitching={pCats}
              onBattingChange={handleBCatsChange}
              onPitchingChange={handlePCatsChange}
            />

            {adRoster && (
              <button
                onClick={handleAddDrop}
                disabled={adLoading || !adDropPlayer || !adAddPlayer.trim()}
                className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold py-3.5 rounded-xl text-base transition-colors"
              >
                {adLoading ? '分析中...' : '⚖️ 分析 Add/Drop 影響'}
              </button>
            )}

            {adError && (
              <div className="bg-red-900/50 border border-red-700 text-red-300 text-sm rounded-xl p-3">
                {adError}
              </div>
            )}

            {adLoading && <LoadingSpinner message="正在比較陣容變化..." />}

            {/* Add/Drop results */}
            {adResult && !adLoading && (
              <AddDropResult result={adResult} />
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── FA Result List ────────────────────────────────────────
function FAResultList({ rows, categories }) {
  return (
    <div className="space-y-2">
      {rows.map((row, i) => (
        <div key={i} className="bg-slate-800 rounded-xl p-3">
          <div className="flex items-center justify-between mb-2">
            <div>
              <span className="text-slate-500 text-xs mr-2">#{i + 1}</span>
              <span className="text-white text-sm font-medium">{row.Name}</span>
              {row.Team && <span className="text-slate-400 text-xs ml-2">{row.Team}</span>}
            </div>
            <div className="text-right">
              <div className="text-xs text-slate-400">PR 總分</div>
              <div className="text-white font-bold">{row.PR_Total?.toFixed(0) ?? '—'}</div>
            </div>
          </div>
          <div className="flex flex-wrap gap-1">
            {categories.map(cat => (
              <div key={cat} className="flex flex-col items-center">
                <span className="text-slate-500 text-xs">{cat}</span>
                <PRBadge value={row[cat]} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Add/Drop Result ───────────────────────────────────────
function deltaColor(d) {
  if (d === null || d === undefined) return 'text-slate-500'
  if (d > 0) return 'text-green-400'
  if (d < 0) return 'text-red-400'
  return 'text-slate-400'
}

function deltaArrow(d) {
  if (d === null || d === undefined) return '—'
  if (d > 0) return `+${d} ↑`
  if (d < 0) return `${d} ↓`
  return '0'
}

function prColor(v) {
  if (v === null || v === undefined) return 'text-slate-500'
  if (v >= 80) return 'text-green-400'
  if (v >= 60) return 'text-green-300'
  if (v >= 40) return 'text-yellow-400'
  if (v >= 20) return 'text-orange-400'
  return 'text-red-400'
}

function AddDropResult({ result }) {
  const cats = result.categories || []
  const label = result.drop_type === 'batter' ? '打者' : '投手'

  return (
    <div className="space-y-3">
      <div className="bg-slate-800 rounded-xl p-3">
        <p className="text-sm text-white font-medium mb-0.5">
          <span className="text-red-400">▼ Drop</span> {result.drop_player}
          <span className="text-slate-500 text-xs ml-2">[{label}]</span>
        </p>
        <p className="text-sm text-white font-medium">
          <span className="text-green-400">▲ Add</span> {result.add_player}
        </p>
        {result.unmatched?.length > 0 && (
          <p className="text-yellow-300 text-xs mt-1">⚠️ 找不到：{result.unmatched.join('、')}</p>
        )}
      </div>

      <div className="bg-slate-800 rounded-xl overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-5 gap-0 bg-slate-700 px-3 py-2">
          <div className="text-xs text-slate-400 font-medium">類別</div>
          <div className="text-xs text-slate-400 text-center">Drop PR</div>
          <div className="text-xs text-slate-400 text-center">Add PR</div>
          <div className="text-xs text-slate-400 text-center">目前陣容</div>
          <div className="text-xs text-slate-400 text-center">差異</div>
        </div>
        {cats.map(cat => {
          const dropPr  = result.drop_pr?.[cat]
          const addPr   = result.add_pr?.[cat]
          const currAvg = result.current_team_avg?.[cat]
          const delta   = result.delta?.[cat]
          return (
            <div key={cat} className="grid grid-cols-5 gap-0 px-3 py-2 border-t border-slate-700">
              <div className="text-xs font-mono text-slate-300">{cat}</div>
              <div className={`text-xs font-mono font-bold text-center ${prColor(dropPr)}`}>
                {dropPr?.toFixed(0) ?? '—'}
              </div>
              <div className={`text-xs font-mono font-bold text-center ${prColor(addPr)}`}>
                {addPr?.toFixed(0) ?? '—'}
              </div>
              <div className="text-xs font-mono text-slate-400 text-center">
                {currAvg?.toFixed(0) ?? '—'}
              </div>
              <div className={`text-xs font-mono font-bold text-center ${deltaColor(delta)}`}>
                {deltaArrow(delta)}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
