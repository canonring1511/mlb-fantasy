import { useState, useEffect, useRef } from 'react'
import { analyzeRoster, ocrRoster } from '../api'
import { loadSettings, saveRoster, listRosters, loadRoster, deleteRoster } from '../store'
import PRTable from '../components/PRTable'
import StrengthBar from '../components/StrengthBar'
import LoadingSpinner from '../components/LoadingSpinner'

export default function RosterPage() {
  const settings = loadSettings()
  const [batters, setBatters] = useState('')
  const [pitchers, setPitchers] = useState('')
  const [loading, setLoading] = useState(false)
  const [ocrLoading, setOcrLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [tab, setTab] = useState('batters')  // 'batters' | 'pitchers'
  const [rosterName, setRosterName] = useState('')
  const [savedRosters, setSavedRosters] = useState(listRosters())
  const [showSaved, setShowSaved] = useState(false)
  const fileInputRef = useRef(null)

  function parseNames(text) {
    return text.split('\n').map(s => s.trim()).filter(Boolean)
  }

  async function handleAnalyze() {
    const bList = parseNames(batters)
    const pList = parseNames(pitchers)
    if (!bList.length && !pList.length) {
      setError('請輸入球員名字')
      return
    }
    setError('')
    setLoading(true)
    try {
      const data = await analyzeRoster(
        bList, pList,
        settings.year, settings.period,
        settings.battingCategories,
        settings.pitchingCategories,
      )
      setResult(data)
    } catch (e) {
      setError(e.response?.data?.detail || e.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleOCR(e) {
    const files = Array.from(e.target.files)
    if (!files.length) return
    setOcrLoading(true)
    setError('')

    // 用現有名單作為起始集合（去重用）
    let newBatters  = batters.split('\n').map(s => s.trim()).filter(Boolean)
    let newPitchers = pitchers.split('\n').map(s => s.trim()).filter(Boolean)
    const seenB = new Set(newBatters.map(n => n.toLowerCase()))
    const seenP = new Set(newPitchers.map(n => n.toLowerCase()))

    let failCount = 0
    for (const file of files) {
      try {
        const data = await ocrRoster(file)
        for (const name of (data.batters || [])) {
          if (name && !seenB.has(name.toLowerCase())) {
            newBatters.push(name)
            seenB.add(name.toLowerCase())
          }
        }
        for (const name of (data.pitchers || [])) {
          if (name && !seenP.has(name.toLowerCase())) {
            newPitchers.push(name)
            seenP.add(name.toLowerCase())
          }
        }
      } catch (err) {
        failCount++
      }
    }

    if (newBatters.length)  setBatters(newBatters.join('\n'))
    if (newPitchers.length) setPitchers(newPitchers.join('\n'))
    if (failCount > 0) setError(`${failCount} 張截圖辨識失敗，其餘已加入`)

    setOcrLoading(false)
    e.target.value = ''
  }

  function handleSave() {
    if (!rosterName.trim()) return
    saveRoster(rosterName.trim(), parseNames(batters), parseNames(pitchers))
    setSavedRosters(listRosters())
    setRosterName('')
  }

  function handleLoad(name) {
    const roster = loadRoster(name)
    if (roster) {
      setBatters(roster.batters.join('\n'))
      setPitchers(roster.pitchers.join('\n'))
      setResult(null)
      setShowSaved(false)
    }
  }

  function handleDelete(name) {
    deleteRoster(name)
    setSavedRosters(listRosters())
  }

  const bCats = settings.battingCategories || ['H','HR','RBI','SB','AVG','BB','2B','3B','K']
  const pCats = settings.pitchingCategories || ['W','SV','ERA','WHIP','SO','HLD','BB','IP']

  return (
    <div className="page-content">
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-white">我的陣容分析</h1>
            <p className="text-xs text-slate-400">{settings.year} · {settings.period === 'season' ? '全季' : '近30天'}</p>
          </div>
          <button
            onClick={() => setShowSaved(!showSaved)}
            className="text-xs bg-slate-700 px-3 py-1.5 rounded-full text-slate-300"
          >
            📂 已儲存
          </button>
        </div>

        {/* Saved rosters panel */}
        {showSaved && (
          <div className="bg-slate-800 rounded-xl p-3 space-y-2">
            {savedRosters.length === 0 ? (
              <p className="text-slate-400 text-sm">尚無儲存的陣容</p>
            ) : (
              savedRosters.map(r => (
                <div key={r.name} className="flex items-center justify-between">
                  <button
                    onClick={() => handleLoad(r.name)}
                    className="text-sm text-blue-400 flex-1 text-left"
                  >
                    {r.name}
                    <span className="text-slate-500 text-xs ml-2">
                      ({r.batters.length}打/{r.pitchers.length}投)
                    </span>
                  </button>
                  <button
                    onClick={() => handleDelete(r.name)}
                    className="text-red-400 text-xs px-2"
                  >
                    刪除
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {/* OCR upload */}
        <div className="bg-slate-800 rounded-xl p-3">
          <p className="text-xs text-slate-400 mb-2">上傳陣容截圖自動識別球員</p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleOCR}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={ocrLoading}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium py-2.5 rounded-lg transition-colors"
          >
            {ocrLoading ? '識別中...' : '📸 上傳截圖（可多張）'}
          </button>
        </div>

        {/* Input tabs */}
        <div className="bg-slate-800 rounded-xl overflow-hidden">
          <div className="flex border-b border-slate-700">
            <button
              onClick={() => setTab('batters')}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors ${tab === 'batters' ? 'text-white bg-slate-700' : 'text-slate-400'}`}
            >
              打者
            </button>
            <button
              onClick={() => setTab('pitchers')}
              className={`flex-1 py-2.5 text-sm font-medium transition-colors ${tab === 'pitchers' ? 'text-white bg-slate-700' : 'text-slate-400'}`}
            >
              投手
            </button>
          </div>
          <div className="p-3">
            {tab === 'batters' ? (
              <textarea
                value={batters}
                onChange={e => setBatters(e.target.value)}
                placeholder={"每行一個球員名字\nAaron Judge\nShohei Ohtani\nFreddie Freeman"}
                rows={8}
                className="w-full bg-slate-900 text-slate-200 text-sm p-2 rounded-lg border border-slate-600 focus:outline-none focus:border-blue-500 resize-none"
              />
            ) : (
              <textarea
                value={pitchers}
                onChange={e => setPitchers(e.target.value)}
                placeholder={"每行一個球員名字\nGerrit Cole\nTylor Megill\nEmmanuel Clase"}
                rows={8}
                className="w-full bg-slate-900 text-slate-200 text-sm p-2 rounded-lg border border-slate-600 focus:outline-none focus:border-blue-500 resize-none"
              />
            )}
          </div>
        </div>

        {/* Save roster */}
        <div className="flex gap-2">
          <input
            value={rosterName}
            onChange={e => setRosterName(e.target.value)}
            placeholder="陣容名稱"
            className="flex-1 bg-slate-800 text-slate-200 text-sm px-3 py-2 rounded-lg border border-slate-700 focus:outline-none focus:border-blue-500"
          />
          <button
            onClick={handleSave}
            disabled={!rosterName.trim()}
            className="bg-slate-700 hover:bg-slate-600 disabled:opacity-40 text-white text-sm px-4 py-2 rounded-lg transition-colors"
          >
            💾 儲存
          </button>
        </div>

        {/* Analyze button */}
        <button
          onClick={handleAnalyze}
          disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold py-3.5 rounded-xl text-base transition-colors"
        >
          {loading ? '分析中...' : '⚾ 開始分析'}
        </button>

        {error && (
          <div className="bg-red-900/50 border border-red-700 text-red-300 text-sm rounded-xl p-3">
            {error}
          </div>
        )}

        {loading && <LoadingSpinner message="正在下載 MLB 數據並計算 PR..." />}

        {/* Results */}
        {result && !loading && (
          <div className="space-y-6">
            {/* Unmatched */}
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

            {/* Batter results */}
            {result.batters && (
              <section>
                <h2 className="text-base font-bold text-white mb-3">⚾ 打者 PR 值</h2>
                <PRTable rows={result.batters.pr_table} categories={bCats} />
                <div className="mt-4">
                  <h3 className="text-sm font-medium text-slate-300 mb-2">陣容打擊強弱</h3>
                  <StrengthBar
                    teamAvg={result.batters.team_avg}
                    categories={bCats}
                    strengths={result.batters.strengths}
                    weaknesses={result.batters.weaknesses}
                  />
                </div>
              </section>
            )}

            {/* Pitcher results */}
            {result.pitchers && (
              <section>
                <h2 className="text-base font-bold text-white mb-3">🥎 投手 PR 值</h2>
                <PRTable rows={result.pitchers.pr_table} categories={pCats} />
                <div className="mt-4">
                  <h3 className="text-sm font-medium text-slate-300 mb-2">陣容投球強弱</h3>
                  <StrengthBar
                    teamAvg={result.pitchers.team_avg}
                    categories={pCats}
                    strengths={result.pitchers.strengths}
                    weaknesses={result.pitchers.weaknesses}
                  />
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
