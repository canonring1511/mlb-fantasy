/**
 * Simple localStorage-based store for roster persistence
 */

const ROSTER_KEY = 'fantasy_rosters'
const SETTINGS_KEY = 'fantasy_settings'

const DEFAULT_BATTING  = ['H', 'HR', 'RBI', 'SB', 'AVG', 'BB', '2B', '3B', 'K']
const DEFAULT_PITCHING = ['W', 'SV', 'ERA', 'WHIP', 'SO', 'HLD', 'BB', 'IP']

function _defaults() {
  return {
    geminiKey: '',
    year: new Date().getFullYear(),
    period: 'season',
    // Per-page categories (roster page vs FA page)
    rosterBattingCategories:  [...DEFAULT_BATTING],
    rosterPitchingCategories: [...DEFAULT_PITCHING],
    faBattingCategories:      [...DEFAULT_BATTING],
    faPitchingCategories:     [...DEFAULT_PITCHING],
  }
}

// ── Settings ─────────────────────────────────────────────

export function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      const defs = _defaults()
      // Migrate old per-global battingCategories → per-page keys if not yet set
      if (!parsed.rosterBattingCategories) {
        parsed.rosterBattingCategories = parsed.battingCategories || defs.rosterBattingCategories
      }
      if (!parsed.rosterPitchingCategories) {
        parsed.rosterPitchingCategories = parsed.pitchingCategories || defs.rosterPitchingCategories
      }
      if (!parsed.faBattingCategories) {
        parsed.faBattingCategories = parsed.battingCategories || defs.faBattingCategories
      }
      if (!parsed.faPitchingCategories) {
        parsed.faPitchingCategories = parsed.pitchingCategories || defs.faPitchingCategories
      }
      return { ...defs, ...parsed }
    }
  } catch {}
  return _defaults()
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
