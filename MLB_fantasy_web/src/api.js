/**
 * API client for the FastAPI backend
 */
import axios from 'axios'

// Set this to your Render.com URL after deployment
// During local dev, uses the local FastAPI server
const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 60000,  // 60s — MLB API can be slow on cold start
})

// Get Gemini API key from localStorage
function getGeminiKey() {
  return localStorage.getItem('gemini_api_key') || ''
}

export async function analyzeRoster(batters, pitchers, year, period, battingCats, pitchingCats) {
  const { data } = await api.post('/analyze/roster', {
    batters,
    pitchers,
    year,
    period,
    batting_categories: battingCats,
    pitching_categories: pitchingCats,
  })
  return data
}

export async function analyzeFA(batterNames, pitcherNames, year, period, battingCats, pitchingCats) {
  const { data } = await api.post('/analyze/fa', {
    batter_names: batterNames,
    pitcher_names: pitcherNames,
    year,
    period,
    batting_categories: battingCats,
    pitching_categories: pitchingCats,
  })
  return data
}

export async function analyzeSavant(playerNames, year) {
  const { data } = await api.post('/analyze/savant', {
    player_names: playerNames,
    year,
  })
  return data
}

export async function analyzeAddDrop(
  rosterBatters, rosterPitchers,
  dropPlayer, addPlayer, dropType,
  year, period, battingCats, pitchingCats
) {
  const { data } = await api.post('/analyze/add-drop', {
    roster_batters: rosterBatters,
    roster_pitchers: rosterPitchers,
    drop_player: dropPlayer,
    add_player: addPlayer,
    drop_type: dropType,
    year,
    period,
    batting_categories: battingCats,
    pitching_categories: pitchingCats,
  })
  return data
}

export async function ocrRoster(imageFile) {
  const key = getGeminiKey()
  if (!key) throw new Error('請先在設定中輸入 Gemini API Key')
  const form = new FormData()
  form.append('file', imageFile)
  form.append('gemini_api_key', key)
  const { data } = await api.post('/ocr/roster', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data  // { batters: [...], pitchers: [...] }
}

export async function ocrFA(imageFile) {
  const key = getGeminiKey()
  if (!key) throw new Error('請先在設定中輸入 Gemini API Key')
  const form = new FormData()
  form.append('file', imageFile)
  form.append('gemini_api_key', key)
  const { data } = await api.post('/ocr/fa', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return data  // { players: [...] }
}
