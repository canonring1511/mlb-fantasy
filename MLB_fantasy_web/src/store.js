/**
 * Simple localStorage-based store for roster persistence
 */

const ROSTER_KEY = 'fantasy_rosters'
const SETTINGS_KEY = 'fantasy_settings'

// ── Settings ─────────────────────────────────────────────

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw) return JSON.parse(raw)
  } catch {}
  return {
    geminiKey: '',
    year: new Date().getFullYear(),
    period: 'season',
    battingCategories: ['H', 'HR', 'RBI', 'SB', 'AVG', 'BB', '2B', '3B', 'K'],
    pitchingCategories: ['W', 'SV', 'ERA', 'WHIP', 'SO', 'HLD', 'BB', 'IP'],
  }
}

export function saveSettings(settings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
  // Also update gemini key separately for api.js
  if (settings.geminiKey) {
    localStorage.setItem('gemini_api_key', settings.geminiKey)
  }
}

// ── Rosters ──────────────────────────────────────────────

export function listRosters() {
  try {
    const raw = localStorage.getItem(ROSTER_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function saveRoster(name, batters, pitchers) {
  const rosters = listRosters()
  const existing = rosters.findIndex(r => r.name === name)
  const entry = { name, batters, pitchers, savedAt: new Date().toISOString() }
  if (existing >= 0) {
    rosters[existing] = entry
  } else {
    rosters.push(entry)
  }
  localStorage.setItem(ROSTER_KEY, JSON.stringify(rosters))
}

export function loadRoster(name) {
  return listRosters().find(r => r.name === name) || null
}

export function deleteRoster(name) {
  const rosters = listRosters().filter(r => r.name !== name)
  localStorage.setItem(ROSTER_KEY, JSON.stringify(rosters))
}
